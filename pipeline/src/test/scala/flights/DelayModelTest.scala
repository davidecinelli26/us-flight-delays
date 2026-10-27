package flights

import scala.util.Random

import org.apache.spark.sql.DataFrame
import org.apache.spark.sql.functions.col

class DelayModelTest extends SparkSuite {

  /** Synthetic flights whose lateness depends on the airline and the hour, as in a logistic model. */
  def synthetic(n: Int, seed: Int = 7): DataFrame = {
    import spark.implicits._
    val rng = new Random(seed)
    val airlineEffect = Map("AA" -> 0.0, "DL" -> -0.8, "NK" -> 0.9)
    val rows = (1 to n).map { _ =>
      val airline = airlineEffect.keys.toSeq(rng.nextInt(3))
      val hour = rng.nextInt(24)
      val logit = -1.5 + airlineEffect(airline) + 0.06 * hour
      val late = rng.nextDouble() < 1 / (1 + math.exp(-logit))
      (airline, Seq("JFK", "ATL", "ORD")(rng.nextInt(3)), Seq("LAX", "SFO")(rng.nextInt(2)), 1 + rng.nextInt(12),
        1 + rng.nextInt(7), hour, 1 + rng.nextInt(28), late, false, false)
    }
    rows.toDF("airline", "origin", "dest", "month", "weekday", "hour", "day", "arrDel15", "cancelled", "diverted")
  }

  test("the exported weights reproduce Spark's probabilities exactly") {
    val data = DelayModel.dataset(synthetic(4000))
    val model = DelayModel.pipeline(1e-4).fit(data)
    val exported = DelayModel.weights(model, data)
    val intercept = exported("intercept").num
    val features = exported("features").obj

    val scored = model.transform(data).select((DelayModel.Features.map(col) :+ DelayModel.probability.as("p")): _*).collect()
    val worst = scored.map { r =>
      val logit = intercept + DelayModel.Features.indices.map { i =>
        val f = features(DelayModel.Features(i))
        f("weights").obj.get(r.getString(i)).map(_.num).getOrElse(f("unknown").num)
      }.sum
      math.abs(1 / (1 + math.exp(-logit)) - r.getAs[Double]("p"))
    }.max
    assert(worst < 1e-4, s"largest difference $worst") // weights are rounded to 6 decimals
  }

  test("the model learns the effects that generated the data") {
    val data = DelayModel.dataset(synthetic(20000))
    val w = DelayModel.weights(DelayModel.pipeline(1e-5).fit(data), data)("features")
    val airline = w("airline")("weights")
    assert(airline("NK").num > airline("AA").num && airline("AA").num > airline("DL").num)
    assert(w("hour")("weights")("20").num > w("hour")("weights")("2").num)
  }

  test("an end-to-end run beats the constant baseline and reports a calibration table") {
    val out = DelayModel.run(synthetic(20000))
    val metrics = out("metrics")
    assert(metrics("model")("auc").num > 0.6)
    assert(metrics("constant")("auc").num == 0.5)
    assert(metrics("model")("brier").num < metrics("constant")("brier").num)
    assert(out("calibration").arr.length == 10)
    assert(out("trainFlights").num + out("testFlights").num == 20000)
  }
}

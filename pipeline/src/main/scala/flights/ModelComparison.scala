package flights

import java.nio.file.{Files, Paths}
import scala.jdk.CollectionConverters._
import scala.util.Using

import org.apache.spark.ml.classification.{GBTClassifier, LogisticRegression}
import org.apache.spark.ml.feature.{OneHotEncoder, StringIndexer, VectorAssembler}
import org.apache.spark.ml.functions.vector_to_array
import org.apache.spark.ml.{Pipeline, PipelineStage}
import org.apache.spark.sql.functions._
import org.apache.spark.sql.{Column, DataFrame}

import flights.Flights.completed

/** Does a richer model predict delays better than the one on the dashboard?
  *
  * `sbt "runMain flights.ModelComparison"` compares, on the 2024 test set of [[DelayModel]] (days 22-31):
  *  - the dashboard model: logistic regression on airline, origin, destination, month, weekday and hour;
  *  - the same with interactions (airline x hour, origin x hour, destination x hour, origin x month) and the
  *    congestion known from the schedule (departures planned at the origin in that hour, that day);
  *  - gradient-boosted trees on the same information, which find interactions by themselves.
  * Writes web/public/data/model_comparison.json.
  */
object ModelComparison {

  private val Base = DelayModel.Features
  private val Crossed = Seq("airline" -> "hour", "origin" -> "hour", "dest" -> "hour", "origin" -> "month")

  def main(args: Array[String]): Unit = {
    val spark = Main.session()
    try {
      val files = Using.resource(Files.list(Main.FlightFiles))(_.iterator().asScala.filter(_.toString.contains("2024-")).toList)
      val flights = Flights.read(spark, files.sorted.map(Main.local))
      // Scheduled departures from the same airport in the same hour of the same day: known from the timetable.
      val congestion = flights.groupBy("origin", "date", "hour").agg(count(lit(1)).as("slotDepartures"))
      val data = flights
        .join(congestion, Seq("origin", "date", "hour"))
        .filter(completed && col("arrDel15").isNotNull)
        .select(
          Base.map(c => col(c).cast("string")) ++ Crossed.map { case (a, b) => concat_ws("|", col(a), col(b)).as(s"${a}_$b") } ++
            Seq(log1p(col("slotDepartures")).as("congestion"), col("arrDel15").cast("double").as("label"), col("day")): _*
        )
        .cache()
      val train = data.filter(col("day") <= 21)
      val test = data.filter(col("day") > 21).cache()
      val crossed = Crossed.map { case (a, b) => s"${a}_$b" }

      def oneHot(columns: Seq[String]): Seq[PipelineStage] = Seq(
        new StringIndexer().setInputCols(columns.toArray).setOutputCols(columns.map(_ + "_idx").toArray).setHandleInvalid("keep"),
        new OneHotEncoder().setInputCols(columns.map(_ + "_idx").toArray).setOutputCols(columns.map(_ + "_vec").toArray).setDropLast(false)
      )
      def logistic(columns: Seq[String], numeric: Seq[String]): Pipeline = new Pipeline().setStages(
        (oneHot(columns) :+
          new VectorAssembler().setInputCols((columns.map(_ + "_vec") ++ numeric).toArray).setOutputCol("features") :+
          new LogisticRegression().setRegParam(1e-5).setStandardization(false).setMaxIter(200).setTol(1e-7)).toArray
      )
      val trees = new Pipeline().setStages(
        Array(
          new StringIndexer().setInputCols(Base.toArray).setOutputCols(Base.map(_ + "_idx").toArray).setHandleInvalid("keep"),
          new VectorAssembler().setInputCols((Base.map(_ + "_idx") :+ "congestion").toArray).setOutputCol("features"),
          new GBTClassifier().setMaxIter(100).setMaxDepth(6).setMaxBins(512).setStepSize(0.2).setSeed(7)
        )
      )

      val models = Seq(
        "Logistic regression (dashboard)" -> logistic(Base, Nil),
        "Logistic regression + interactions + congestion" -> logistic(Base ++ crossed, Seq("congestion")),
        "Gradient-boosted trees (100 trees, depth 6) + congestion" -> trees
      )
      val p: Column = vector_to_array(col("probability")).getItem(1)
      val results = models.map { case (name, pipeline) =>
        val start = System.nanoTime()
        val metrics = DelayModel.evaluate(pipeline.fit(train).transform(test), p)
        val minutes = (System.nanoTime() - start) / 6e10
        println(f"$name%-60s AUC ${metrics.auc}%.4f  Brier ${metrics.brier}%.4f  log loss ${metrics.logLoss}%.4f  ($minutes%.1f min)")
        metrics.json.obj ++ Seq("name" -> ujson.Str(name), "minutes" -> ujson.Num(math.round(minutes * 10) / 10.0))
      }
      Json.write(Paths.get("web", "public", "data", "model_comparison.json"), ujson.Arr.from(results.map(ujson.Obj.from(_))))
    } finally spark.stop()
  }
}

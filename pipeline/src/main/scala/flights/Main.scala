package flights

import java.nio.file.{Files, Path, Paths}
import scala.jdk.CollectionConverters._
import scala.util.Using

import org.apache.spark.sql.functions.{col, year}
import org.apache.spark.sql.{DataFrame, SparkSession}

/** `sbt "run [download] [analyze] [model]"`, from the repository root; no argument runs all three steps.
  *
  *  - download: fetches and verifies the raw files in data/raw and repacks them into data/flights
  *  - analyze: writes the dashboard tables of every year to web/public/data/<year>/, and years.json
  *  - model: trains and evaluates the delay model on the latest year and writes web/public/data/model.json
  */
object Main {

  val Raw: Path = Paths.get("data", "raw")
  val FlightFiles: Path = Paths.get("data", "flights")
  val Out: Path = Paths.get("web", "public", "data")

  def main(args: Array[String]): Unit = {
    val steps = if (args.isEmpty) Set("download", "analyze", "model") else args.toSet
    val unknown = steps -- Set("download", "analyze", "model")
    require(unknown.isEmpty, s"unknown step(s): ${unknown.mkString(", ")}")

    if (steps("download")) Sources.prepare(Raw, FlightFiles)
    if (steps("analyze") || steps("model")) {
      val spark = session()
      try {
        val files = Using.resource(Files.list(FlightFiles))(_.iterator().asScala.filter(_.toString.endsWith(".csv.gz")).toList)
        require(files.nonEmpty, s"no .csv.gz files in $FlightFiles: run the download step first")
        val flights = Flights.read(spark, files.sorted.map(local)).withColumn("year", year(col("date"))).cache()
        val years = flights.select("year").distinct().collect().map(_.getInt(0)).sorted.toSeq
        println(f"${flights.count()}%,d flights in ${years.mkString(", ")}")
        if (steps("analyze")) analyze(spark, flights, years)
        if (steps("model")) {
          val model = DelayModel.run(flights.filter(col("year") === years.last))
          model("year") = years.last
          Json.write(Out.resolve("model.json"), model)
        }
      } finally spark.stop()
    }
  }

  def analyze(spark: SparkSession, flights: DataFrame, years: Seq[Int]): Unit = {
    val coordinates = Analytics.coordinates(spark, local(Raw.resolve(Sources.airports.file))).cache()
    val summaries = years.map { y =>
      val f = flights.filter(col("year") === y)
      val dir = Out.resolve(y.toString)
      val summary = Analytics.summary(f)
      Json.write(dir.resolve("summary.json"), summary)
      Json.write(dir.resolve("months.json"), Json.rows(Analytics.byMonth(f)))
      Json.write(dir.resolve("weekdays.json"), Json.rows(Analytics.byWeekday(f)))
      Json.write(dir.resolve("hours.json"), Json.rows(Analytics.byHour(f)))
      Json.write(dir.resolve("delay_histogram.json"), Json.rows(Analytics.delayHistogram(f)))
      Json.write(dir.resolve("disruptions.json"), Analytics.disruptions(f))
      Json.write(dir.resolve("airlines.json"), Json.rows(Analytics.airlines(f)))
      Json.write(dir.resolve("airports.json"), Json.rows(Analytics.airports(f, coordinates)))
      Json.write(dir.resolve("routes.json"), Json.rows(Analytics.routes(f)))
      Json.write(dir.resolve("aircraft.json"), Json.rows(Analytics.aircraft(f)))
      summary("year") = y
      summary
    }
    Json.write(Out.resolve("years.json"), ujson.Arr.from(summaries))
  }

  /** A local path as Spark expects it. A file: URI would keep non-ASCII characters percent-encoded, and Spark
    * does not decode them, so a folder like "Università" would not be found.
    */
  def local(path: Path): String = path.toAbsolutePath.toString.replace('\\', '/')

  def session(): SparkSession =
    SparkSession
      .builder()
      .appName("us-flight-delays")
      .master("local[*]")
      .config("spark.sql.shuffle.partitions", "32")
      .config("spark.ui.enabled", "false")
      .config("spark.sql.session.timeZone", "UTC")
      .getOrCreate()
}

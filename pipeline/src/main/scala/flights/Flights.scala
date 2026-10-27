package flights

import org.apache.spark.sql.functions._
import org.apache.spark.sql.{Column, DataFrame, SparkSession}

/** One row per scheduled flight, with the columns of the BTS files that the analysis uses.
  *
  * BTS numbers come as text ("1.00", "-5.00", ""), so every column is read as a string and converted with
  * `try_cast`: a malformed value becomes null instead of failing the job (Spark 4 runs in ANSI mode).
  */
object Flights {

  /** Reads the gzipped monthly CSVs; only the selected columns are parsed.
    *
    * The files are listed here rather than with a glob: on Windows, Hadoop lists a directory through a native
    * library that is usually missing, and the read would hang.
    */
  def read(spark: SparkSession, files: Seq[String]): DataFrame =
    clean(spark.read.option("header", "true").csv(files: _*))

  def clean(raw: DataFrame): DataFrame = raw.select(
    to_date(col("FlightDate")).as("date"),
    int("Month").as("month"),
    int("DayofMonth").as("day"),
    int("DayOfWeek").as("weekday"), // 1 = Monday ... 7 = Sunday
    col("Reporting_Airline").as("airline"),
    nullIfEmpty("Tail_Number").as("tail"),
    col("Origin").as("origin"),
    col("OriginCityName").as("originCity"),
    col("OriginState").as("originState"),
    col("Dest").as("dest"),
    col("DestCityName").as("destCity"),
    col("DestState").as("destState"),
    (int("CRSDepTime") / 100).cast("int").mod(24).as("hour"), // scheduled departure, local time, "hhmm"
    num("DepDelay").as("depDelay"),
    flag("DepDel15").as("depDel15"),
    num("ArrDelay").as("arrDelay"),
    flag("ArrDel15").as("arrDel15"),
    flag("Cancelled").as("cancelled"),
    nullIfEmpty("CancellationCode").as("cancellationCode"),
    flag("Diverted").as("diverted"),
    flag("DivReachedDest").as("divReachedDest"),
    int("DivAirportLandings").as("divLandings"),
    num("Distance").as("distance"), // statute miles
    num("CarrierDelay").as("carrierDelay"),
    num("WeatherDelay").as("weatherDelay"),
    num("NASDelay").as("nasDelay"),
    num("SecurityDelay").as("securityDelay"),
    num("LateAircraftDelay").as("lateAircraftDelay")
  )

  // Outcome of a scheduled flight, following the BTS definitions: every flight is exactly one of on time
  // (arrived less than 15 minutes late), delayed, cancelled or diverted.
  val cancelled: Column = col("cancelled")
  val diverted: Column = col("diverted")
  val completed: Column = !cancelled && !diverted
  val delayed: Column = completed && col("arrDel15")
  val onTime: Column = completed && !col("arrDel15")

  private def num(name: String): Column = expr(s"try_cast(`$name` AS DOUBLE)")
  private def int(name: String): Column = expr(s"try_cast(try_cast(`$name` AS DOUBLE) AS INT)")
  private def flag(name: String): Column = num(name) === 1.0
  private def nullIfEmpty(name: String): Column = when(trim(col(name)) =!= "", trim(col(name)))
}

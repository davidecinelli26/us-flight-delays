package flights

import java.nio.file.Paths

import org.apache.spark.sql.{DataFrame, SparkSession}
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funsuite.AnyFunSuite

/** A local Spark session shared by the tests of a suite, and the eight flights of `sample.csv`. */
trait SparkSuite extends AnyFunSuite with BeforeAndAfterAll {

  lazy val spark: SparkSession = SparkSession
    .builder()
    .master("local[2]")
    .appName("tests")
    .config("spark.ui.enabled", "false")
    .config("spark.sql.shuffle.partitions", "2")
    .config("spark.sql.session.timeZone", "UTC")
    .getOrCreate()

  lazy val sample: DataFrame = Flights
    .clean(spark.read.option("header", "true").csv(Main.local(Paths.get(getClass.getResource("/sample.csv").toURI))))
    .cache()

  override def afterAll(): Unit = {
    spark.stop()
    super.afterAll()
  }
}

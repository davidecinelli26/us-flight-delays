package flights

import java.io.{BufferedOutputStream, InputStream, OutputStream}
import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.nio.file.{Files, Path, StandardCopyOption}
import java.security.MessageDigest
import java.util.zip.{GZIPOutputStream, ZipInputStream}
import scala.io.{Source => ScalaSource}
import scala.util.Using

/** Raw data: the BTS On-Time Performance files, one zipped CSV per month, and the OurAirports airport list.
  *
  * `checksums.sha256` lists every file with its SHA-256, so the analysis always runs on the same bytes and adding a
  * month means adding a line. Spark cannot split a zip, so each monthly file is repacked once into a gzipped CSV.
  */
object Sources {

  final case class Source(url: String, file: String, sha256: String)

  private val Bts = "https://transtats.bts.gov/PREZIP"
  // OurAirports is in the public domain; pinned to one commit because the file is updated every night.
  private val OurAirports =
    "https://raw.githubusercontent.com/davidmegginson/ourairports-data/51db9e043efd4b8639a15f7f5f693e815459cb22"
  private val Monthly = """On_Time_Reporting_Carrier_On_Time_Performance_1987_present_(\d{4})_(\d{1,2})\.zip""".r

  val all: Seq[Source] = Using.resource(ScalaSource.fromResource("checksums.sha256")) { lines =>
    lines.getLines().map(_.trim).filter(_.nonEmpty).map { line =>
      val Array(sha, file) = line.split("\\s+", 2)
      val base = if (file.startsWith("On_Time")) Bts else OurAirports
      Source(s"$base/$file", file, sha)
    }.toList
  }

  val monthly: Seq[Source] = all.filter(s => Monthly.matches(s.file))
  val airports: Source = all.find(_.file == "airports.csv").get

  /** Downloads what is missing, verifies every file and repacks the monthly zips into `flights`. */
  def prepare(raw: Path, flights: Path): Unit = {
    Files.createDirectories(flights)
    for (src <- monthly) {
      val zip = fetch(src, raw)
      val Monthly(year, month) = src.file
      val csv = flights.resolve(f"$year-${month.toInt}%02d.csv.gz")
      if (!Files.exists(csv)) repack(zip, csv)
    }
    fetch(airports, raw)
  }

  def fetch(src: Source, dir: Path): Path = {
    Files.createDirectories(dir)
    val target = dir.resolve(src.file)
    if (!Files.exists(target) || sha256(target) != src.sha256) {
      println(s"downloading ${src.url}")
      val tmp = dir.resolve(src.file + ".part")
      val response = http.send(HttpRequest.newBuilder(URI.create(src.url)).build(), HttpResponse.BodyHandlers.ofFile(tmp))
      require(response.statusCode == 200, s"${src.url}: HTTP ${response.statusCode}")
      Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING)
    }
    val actual = sha256(target)
    require(actual == src.sha256, s"${src.file}: SHA-256 is $actual, expected ${src.sha256}")
    target
  }

  def sha256(path: Path): String = {
    val digest = MessageDigest.getInstance("SHA-256")
    Using.resource(Files.newInputStream(path)) { in =>
      val buffer = new Array[Byte](1 << 16)
      Iterator.continually(in.read(buffer)).takeWhile(_ > 0).foreach(digest.update(buffer, 0, _))
    }
    digest.digest().map("%02x".format(_)).mkString
  }

  /** Copies the CSV inside a BTS zip into a gzipped file, through a temporary file so a crash leaves nothing half-written. */
  def repack(zip: Path, out: Path): Unit = {
    println(s"repacking ${zip.getFileName} -> ${out.getFileName}")
    val tmp = out.resolveSibling(out.getFileName.toString + ".part")
    Using.resource(new ZipInputStream(Files.newInputStream(zip))) { in =>
      Iterator.continually(in.getNextEntry).takeWhile(_ != null).find(_.getName.endsWith(".csv")) match {
        case Some(_) =>
          Using.resource(new GZIPOutputStream(new BufferedOutputStream(Files.newOutputStream(tmp)), 1 << 16)) { gz =>
            copy(in, gz)
          }
        case None => sys.error(s"$zip contains no CSV")
      }
    }
    Files.move(tmp, out, StandardCopyOption.REPLACE_EXISTING)
  }

  private def copy(in: InputStream, out: OutputStream): Unit = {
    val buffer = new Array[Byte](1 << 16)
    Iterator.continually(in.read(buffer)).takeWhile(_ > 0).foreach(out.write(buffer, 0, _))
  }

  private lazy val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build()
}

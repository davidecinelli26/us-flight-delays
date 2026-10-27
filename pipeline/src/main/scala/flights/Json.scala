package flights

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path}

import org.apache.spark.sql.{DataFrame, Row}

/** Small result tables to JSON. Everything that reaches the dashboard goes through here. */
object Json {

  def write(path: Path, value: ujson.Value): Unit = {
    Files.createDirectories(path.getParent)
    Files.write(path, ujson.write(value).getBytes(StandardCharsets.UTF_8))
    println(f"wrote ${path.getParent.getFileName}/${path.getFileName}%-26s ${Files.size(path) / 1024.0}%8.1f KB")
  }

  /** Collects a small DataFrame into an array of objects, one per row. */
  def rows(df: DataFrame): ujson.Arr = ujson.Arr.from(df.collect().toSeq.map(row))

  def row(r: Row): ujson.Obj =
    ujson.Obj.from(r.schema.fieldNames.toSeq.zipWithIndex.map { case (name, i) => name -> value(r.get(i)) })

  def value(v: Any): ujson.Value = v match {
    case null                       => ujson.Null
    case s: String                  => ujson.Str(s)
    case b: Boolean                 => ujson.Bool(b)
    case n: Int                     => ujson.Num(n.toDouble)
    case n: Long                    => ujson.Num(n.toDouble)
    case d: Double if d.isNaN       => ujson.Null
    case d: Double                  => ujson.Num(d)
    case d: java.math.BigDecimal    => ujson.Num(d.doubleValue)
    case d: java.sql.Date           => ujson.Str(d.toString)
    case d: java.time.LocalDate     => ujson.Str(d.toString)
    case r: Row                     => row(r)
    case s: scala.collection.Seq[_] => ujson.Arr.from(s.map(value))
    case other                      => sys.error(s"no JSON encoding for ${other.getClass}")
  }
}

package flights

import org.apache.spark.sql.functions.col

class AnalyticsTest extends SparkSuite {

  test("BTS text is parsed into typed columns, and malformed numbers become null") {
    val rows = sample.orderBy("date", "hour").collect()
    assert(rows.length == 8)
    val first = rows.head
    assert(first.getAs[Int]("hour") == 0 && first.getAs[Int]("weekday") == 1)
    assert(first.getAs[Double]("arrDelay") == -10.0 && !first.getAs[Boolean]("arrDel15"))
    assert(sample.filter(col("hour") === 23).count() == 2) // "2359" and "2300"
    assert(sample.filter(col("depDelay").isNull).count() == 3) // two cancellations and the value "bad"
    assert(sample.filter(col("tail").isNull).count() == 1)
  }

  test("every flight is exactly one of on time, delayed, cancelled or diverted") {
    val s = Analytics.summary(sample)
    assert(s("flights").num == 8 && s("airports").num == 3 && s("routes").num == 4 && s("aircraft").num == 3)
    assert(s("onTimePct").num == 37.5) // three on time
    assert(s("delayedPct").num == 25.0) // the two flights with ArrDel15 = 1
    assert(s("cancelledPct").num == 25.0)
    assert(s("divertedPct").num == 12.5)
    assert(s("avgArrDelay").num == 14.8) // (-10 + 60 + 14 + 15 - 5) / 5, over the flights that landed
    assert(s("avgDelayWhenLate").num == 37.5)
  }

  test("delay minutes, cancellation reasons and diversions") {
    val d = Analytics.disruptions(sample)
    val causes = d("delayCauses").arr.map(c => c("cause").str -> c("minutes").num).toMap
    assert(causes == Map("Late aircraft" -> 30, "Airline" -> 20, "Air traffic system" -> 10, "Weather" -> 15, "Security" -> 0))
    assert(math.abs(d("delayCauses").arr.map(_("pct").num).sum - 100) < 0.05)
    assert(d("cancellationReasons").arr.map(r => r("reason").str -> r("flights").num).toSet == Set("Weather" -> 1.0, "Airline" -> 1.0))
    assert(d("diversions")("flights").num == 1 && d("diversions")("reachedDestinationPct").num == 100)
  }

  test("tables by airline, route and month") {
    val airlines = Json.rows(Analytics.airlines(sample)).arr.map(a => a("code").str -> a).toMap
    assert(airlines("AA")("flights").num == 5 && airlines("AA")("name").str == "American Airlines")
    assert(airlines("AA")("flightsPerDay").num == 1.7) // 5 flights on 3 days
    assert(airlines("DL")("aircraft").num == 1)

    val routes = Json.rows(Analytics.routes(sample)).arr.map(r => (r("origin").str, r("dest").str) -> r).toMap
    val jfkLax = routes(("JFK", "LAX"))
    assert(jfkLax("flights").num == 4 && jfkLax("distance").num == 2475)
    assert(jfkLax("airlines").arr.map(_.str) == Seq("AA", "DL")) // busiest first
    assert(jfkLax("cancelledPct").num == 25.0)
    val byAirline = jfkLax("byAirline").arr.map(a => a("airline").str -> a).toMap
    assert(byAirline("AA")("flights").num == 3 && byAirline("AA")("onTimePct").num == 66.67)
    assert(byAirline("DL")("flights").num == 1 && byAirline("DL")("cancelledPct").num == 100)

    val months = Json.rows(Analytics.byMonth(sample)).arr
    assert(months.map(_("month").num) == Seq(1, 2) && months.map(_("flights").num).sum == 8)
  }

  test("delay histogram covers every flight that landed") {
    val h = Json.rows(Analytics.delayHistogram(sample)).arr
    assert(h.map(_("flights").num).sum == 5)
    assert(h.map(b => b("label").str -> b("flights").num).toMap == Map("-15 to 0" -> 2, "0 to 15" -> 1, "15 to 30" -> 1, "60 to 120" -> 1))
  }
}

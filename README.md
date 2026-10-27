# US Flight Delays

**13.4 million US domestic flights of 2013 and 2024, processed with Apache Spark and explored in a static Angular dashboard.**

[![ci](https://github.com/davidecinelli26/us-flight-delays/actions/workflows/ci.yml/badge.svg)](https://github.com/davidecinelli26/us-flight-delays/actions/workflows/ci.yml)
[![pages](https://github.com/davidecinelli26/us-flight-delays/actions/workflows/pages.yml/badge.svg)](https://davidecinelli26.github.io/us-flight-delays/)

**[Open the dashboard](https://davidecinelli26.github.io/us-flight-delays/)**

The Bureau of Transportation Statistics publishes every scheduled flight of the US airlines, with its delays, cancellations and diversions. A Spark job written in Scala reads the files of 2013 and 2024. It computes how flights ended by airline, airport, route, hour, weekday and month, and trains a model that estimates the risk of a delay from what is known when a ticket is bought. The dashboard reads the results as static JSON files. It needs no server and is hosted on GitHub Pages, so the whole analysis can be explored from a link.

## Authors

- [Davide Cinelli](https://github.com/davidecinelli26)
- [Giuseppe Cuiuri](https://github.com/GiuseppeCuiuri)

Started as our project for the course *Modelli e tecniche per Big Data*, MSc in Computer Engineering, University of Calabria, A.Y. 2024/2025, on the flights of 2013. This repository is a revised version, extended to 2024: what changed is in [`CHANGES.md`](CHANGES.md).

## What the data says

| | 2013 | 2024 |
|---|---:|---:|
| Scheduled flights | 6,369,482 | 7,079,061 |
| On time (less than 15 min late) | 78.3% | 77.9% |
| Delayed 15+ min | 19.9% | 20.5% |
| Cancelled | 1.51% | 1.36% |
| Diverted | 0.22% | 0.25% |
| Mean delay of the late flights | 57 min | 72 min |
| Routes / airports / airlines | 4,732 / 320 / 16 | 6,805 / 348 / 15 |

- **A flight is as likely to be late as in 2013, but late by longer.** The share of delayed flights barely moved, while the mean delay of a late flight grew by a quarter, from 57 to 72 minutes.
- **Delays snowball through the day.** About 9% of the flights scheduled to leave at 6 am arrive late, against 29% of those leaving at 7–8 pm. The largest cause is the late arrival of the previous flight of the same aircraft: 40% of all minutes of delay in 2024.
- **Weather cancels flights more than it delays them.** In 2024 weather caused 56% of the cancellations but only 6% of the minutes of delay.
- **The network spread out.** There are 11% more flights than in 2013 but 44% more routes. Five airlines of 2013 are not in the 2024 data. US Airways, AirTran and Virgin America were absorbed by American, Southwest and Alaska. ExpressJet stopped flying, and Mesa no longer reports its flights. Spirit, Allegiant, Republic and PSA report theirs.

### How predictable is a delay?

The *Delay risk* page estimates the probability that a flight arrives 15 minutes late or more, from its airline, airports, date and scheduled hour. The model is a logistic regression trained with Spark MLlib on the 2024 flights of days 1–21 of every month. It is evaluated on days 22–31, which it never saw: delays cluster by day, so a random split would leak them.

| Test set: 2.2M flights | AUC | Brier score | Log loss |
|---|---:|---:|---:|
| Logistic regression | 0.664 | 0.156 | 0.486 |
| Past rate of the same airline, origin and hour | 0.660 | 0.157 | 0.487 |
| Same probability for every flight | 0.500 | 0.166 | 0.514 |

The probabilities are well calibrated: above the lowest decile of risk, the share of delayed flights is within one point of the prediction. But the schedule explains only a small part of delays, and the model ranks flights only slightly better than the past rate of the same airline, airport and hour. The weights are exported to `model.json` and the prediction runs in the browser.

Richer models gain little. `sbt "runMain flights.ModelComparison"` scores two of them on the same test set. The first adds interactions (airline × hour, origin × hour, destination × hour, origin × month) and congestion, the number of departures planned at the airport in that hour. The second is gradient-boosted trees, which find interactions by themselves.

| Same test set | AUC | Brier score | Log loss | Training |
|---|---:|---:|---:|---:|
| Logistic regression (dashboard) | 0.6637 | 0.1564 | 0.4861 | 1 min |
| + interactions and congestion | 0.6712 | **0.1554** | **0.4831** | 2 min |
| Gradient-boosted trees, 100 trees of depth 6 | **0.6725** | 0.1561 | 0.4849 | 6 min |

Less than one point of AUC separates them. Most of what makes a flight late, the weather of the day and the state of the network, is not known when the ticket is bought. The dashboard keeps the simple model, which can be explained factor by factor and needs nothing but the date the user picks.

## The dashboard

| Page | What it shows |
|---|---|
| Overview | Key figures with the change from the other year, outcome of every flight, month by month, the network map, records |
| Delays | Causes of delay, effect of the hour, weekday and month, distribution of delays, cancellations and diversions, best and worst airports and routes |
| Airlines | Every airline's outcomes, sortable |
| Routes | Any route: flights, punctuality, the most punctual airline on it, the same route in the other year, and a plane flying it on the map |
| Delay risk | The model, its factors for a given flight, and how well it does |

The switch at the top right changes the year on every page.

## How it works

```
BTS monthly zips ─► Spark job (Scala) ──────────────► JSON tables ─────────► Angular app
checksum-verified   read, clean, aggregate,           web/public/data/       static, on GitHub Pages
                    train and evaluate the model      2013/, 2024/, model
```

Every answer the dashboard gives is precomputed. There are 7,000 routes, 350 airports and 15 airlines in a year, so all of them fit in about 3 MB of JSON per year, and a page answers in milliseconds instead of waiting for a Spark job.

- [`pipeline/`](pipeline/) is the Spark job (Spark 4.1, Scala 2.13).
  - `Sources` downloads the BTS files and checks them against [SHA-256 checksums](pipeline/src/main/resources/checksums.sha256).
  - `Flights` parses the 110-column CSVs into typed columns.
  - `Analytics` holds the aggregates.
  - `DelayModel` trains, evaluates and exports the model.
  - The tests run on a sample of hand-checked flights and on synthetic data with known effects.
- [`web/`](web/) is the dashboard (Angular 22, Chart.js, Leaflet). The map is drawn from Natural Earth borders shipped with the site, so it needs no tile service.

## Running it

Requirements: JDK 17, [sbt](https://www.scala-sbt.org/) and Node.js 24.

```bash
cd pipeline
sbt test
sbt run        # download (~650 MB from BTS), analyze, model: ~10 minutes, writes web/public/data
cd ../web
npm ci
npx ng serve   # http://localhost:4200
```

The JSON tables are committed, so the dashboard runs without the Spark step. Steps can be run on their own: `sbt "run analyze"`. Adding a year means adding its twelve files to `checksums.sha256`.

## Definitions

- **On time**: arrived less than 15 minutes after the scheduled time; **delayed**: 15 minutes or more. Every scheduled flight is exactly one of on time, delayed, cancelled or diverted, so the four shares add up to 100%.
- **Mean delay**: over the flights that landed at their destination, early arrivals counted as negative.
- **Delay causes**: reported by the airlines for flights 15 minutes late or more, in minutes.
- Distances are in statute miles, as published by BTS.

## Data

- [Reporting Carrier On-Time Performance](https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ), Bureau of Transportation Statistics, US Department of Transportation.
- Airport names and coordinates: [OurAirports](https://ourairports.com/data/), public domain, pinned to one commit.
- Borders: [Natural Earth](https://www.naturalearthdata.com/), public domain.

## License

[MIT](LICENSE)

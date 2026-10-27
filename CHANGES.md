# Changes since the course project

The course version, built for *Modelli e tecniche per Big Data* (University of Calabria, A.Y. 2024/2025), had three parts:
- a Spark job (Scala) that wrote 18 JSON files from the BTS flights of 2013;
- an Akka HTTP server that returned those files on `localhost:8080`;
- an Angular dashboard that requested them.

This version keeps Spark and Angular, rewrites both, and drops the server.

## Architecture

- **No server.** Akka computed nothing: each endpoint returned a JSON file that Spark had already written. Query parameters such as `?origin=JFK&dest=LAX` were ignored, and the browser searched the whole list itself. The dashboard now reads the files directly, so it is a static site, published on GitHub Pages and open to anyone from a link.
- **Runs anywhere.** Paths were hard-coded to one computer (`C:\Users\giuse\...`). The data had to be downloaded by hand and merged with a separate program. `sbt run` now downloads the BTS files, checks them against SHA-256 checksums and runs every step.
- **Two years.** The 2013 files of the course are kept, byte for byte the same as those published by BTS, and 2024 is added. The dashboard switches between the two and shows what changed.

## Data processing

- **Typed parsing.** The 110-column CSVs were read with `inferSchema`, which costs an extra pass over the data, and flags were compared to the string `"1.00"`. Columns are now selected by name and converted with `try_cast`, so that a malformed value becomes null instead of an error.
- **Consistent definitions.** Every flight is exactly one of on time, delayed (15+ minutes), cancelled or diverted, as in the BTS statistics. Before, some percentages counted cancelled flights in the denominator and some did not. The share of delayed flights per month, for example, divided by all flights including cancellations.
- **One table per subject.** Six separate queries grouped the flights by route, each computing one figure. There is now one route table with all of them, plus the same figures for every airline on the route.
- **Rankings with a minimum size.** The "route with the highest mean delay" was typically a route flown once. Rankings now consider the 50 busiest airports, or routes flown at least once a day.
- **Units.** Distances are in miles, as BTS publishes them, but the dashboard labelled them as kilometres. Both units are shown now.
- **New analyses.** The new tables cover:
  - delay by scheduled hour and weekday;
  - the distribution of arrival delays;
  - cancellation reasons;
  - airport punctuality;
  - airline figures per day, route and aircraft.
- **Airport positions.** Coordinates came from a file read from the Desktop. They now come from OurAirports, pinned to one commit, and are matched by IATA code with the ICAO code as a fallback (Palm Beach is PBI in BTS, DJT in OurAirports today).

## Delay prediction

The course model was a linear regression of the arrival delay on departure delay, air time and distance. It had three problems:

- **Leakage.** Departure delay and air time are only known once the flight has left, and arrival delay is almost departure delay plus a few minutes. The model looked accurate but could not predict anything in advance.
- **Misaligned predictions.** They were matched to the test flights with `monotonically_increasing_id`, which does not guarantee the same row order on both sides.
- **No real route prediction.** The dashboard showed, for a route, the prediction for one test flight picked at random.

The new model is a logistic regression for the probability of arriving 15 minutes late or more. Its inputs are what is known when a ticket is bought: airline, origin, destination, month, weekday and scheduled hour.
- **Split by day.** It is trained on days 1–21 of each month of 2024 and tested on days 22–31: delays cluster by day, so a random split would leak them.
- **Compared and calibrated.** It is compared with two baselines and checked for calibration.
- **Runs in the browser.** Its weights are exported, so the dashboard computes predictions for any flight. A test checks that the exported weights give the same probabilities as Spark.

Richer models were tried too: `ModelComparison` adds interactions, schedule congestion and gradient-boosted trees, with the results in the README.

## Dashboard

- **Rewritten in Angular 22.** It uses standalone components, signals, lazy-loaded pages and typed data. Seven chart, map and UI libraries became two, Chart.js and Leaflet.
- **Interface in English**, with light and dark themes and layouts that work on phones.
- **No external map tiles.** The map is drawn from Natural Earth borders shipped with the site, so it needs no external tile service or API key.
- **New features:**
  - comparison between years;
  - the most punctual airline on each route;
  - the factors behind each prediction, with the model's accuracy and calibration;
  - a plane that flies the chosen route along the great circle.

## Engineering

- **Tests.** The Spark job is tested on hand-checked sample flights and on synthetic data with known effects (ScalaTest). The browser-side model is tested with Vitest.
- **Continuous integration** runs both test suites and builds the dashboard on every push; another workflow publishes it to GitHub Pages.
- **Clean repository.** Compiled classes, IDE settings and an empty Excel file named `test.csv` are no longer versioned.

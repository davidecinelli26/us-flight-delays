ThisBuild / scalaVersion := "2.13.18"
ThisBuild / organization := "io.github.davidecinelli26"

val sparkVersion = "4.1.3"

// Spark needs these on Java 17+ when it is not started through spark-submit.
val sparkJavaOptions = Seq(
  "-XX:+IgnoreUnrecognizedVMOptions",
  "--add-opens=java.base/java.lang=ALL-UNNAMED",
  "--add-opens=java.base/java.lang.invoke=ALL-UNNAMED",
  "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
  "--add-opens=java.base/java.io=ALL-UNNAMED",
  "--add-opens=java.base/java.net=ALL-UNNAMED",
  "--add-opens=java.base/java.nio=ALL-UNNAMED",
  "--add-opens=java.base/java.util=ALL-UNNAMED",
  "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED",
  "--add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED",
  "--add-opens=java.base/jdk.internal.ref=ALL-UNNAMED",
  "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED",
  "--add-opens=java.base/sun.nio.cs=ALL-UNNAMED",
  "--add-opens=java.base/sun.security.action=ALL-UNNAMED",
  "--add-opens=java.base/sun.util.calendar=ALL-UNNAMED",
  "-Djdk.reflect.useDirectMethodHandle=false",
  "-Dio.netty.tryReflectionSetAccessible=true"
)

lazy val pipeline = (project in file("."))
  .settings(
    name := "flight-delays-pipeline",
    libraryDependencies ++= Seq(
      "org.apache.spark" %% "spark-sql" % sparkVersion,
      "org.apache.spark" %% "spark-mllib" % sparkVersion,
      "com.lihaoyi" %% "ujson" % "4.4.3",
      "org.scalatest" %% "scalatest" % "3.2.20" % Test
    ),
    scalacOptions ++= Seq("-deprecation", "-feature", "-unchecked", "-Xlint"),
    fork := true,
    javaOptions ++= sparkJavaOptions,
    run / javaOptions += s"-Xmx${sys.env.getOrElse("PIPELINE_MEMORY", "8g")}",
    Test / javaOptions += "-Xmx2g",
    // `sbt run` works from the repository root, where data/ and web/ are.
    run / baseDirectory := baseDirectory.value.getParentFile,
    Test / parallelExecution := false
  )

import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Clé de signature stable d'une version à l'autre (Android refuse une mise à jour signée par une
// autre clé : il faudrait désinstaller, donc perdre les données). Elle n'est PAS dans ce dépôt public :
// GitHub la copie dans android/signing/ au moment de fabriquer l'APK (dépôt privé Auplio, branche investment).
val signingProps = Properties().apply {
    val f = rootProject.file("signing/signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val hasKey = signingProps.getProperty("storePassword") != null

val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "fr.auplio.investment"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.auplio.investment"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "0.5.$buildNumber"
    }

    signingConfigs {
        if (hasKey) {
            create("auplioInvestment") {
                storeFile = rootProject.file("signing/auplio-investment.p12")
                storeType = "PKCS12"
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = if (hasKey) signingConfigs.getByName("auplioInvestment") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

// L'interface (les mêmes fichiers que la version web) est empaquetée dans l'APK : tout fonctionne hors ligne.
val repoRoot = rootDir.parentFile
val wwwAssets = layout.buildDirectory.dir("generated/www-assets")
val copyWww = tasks.register<Copy>("copyWww") {
    from(repoRoot) {
        include("index.html", "app.js", "bank.js", "styles.css", "manifest.webmanifest", "icons/**")
    }
    into(wwwAssets.map { it.dir("www") })
}
android.sourceSets.getByName("main").assets.srcDir(wwwAssets)
tasks.matching { it.name == "preBuild" || (it.name.startsWith("merge") && it.name.endsWith("Assets")) || it.name.contains("lint", ignoreCase = true) }
    .configureEach { if (name != "copyWww") dependsOn(copyWww) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}

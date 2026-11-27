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
    namespace = "fr.nestgoal"
    compileSdk = 35

    defaultConfig {
        // Identifiant Android de l'ancienne appli, conservé : NestGoal s'installe par-dessus, en simple
        // mise à jour. Le changer créerait une deuxième appli à côté de l'ancienne. Invisible à l'écran.
        applicationId = "fr.auplio.investment"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    signingConfigs {
        if (hasKey) {
            create("nestgoal") {
                // Nom du fichier de clé tel qu'il est rangé dans le dépôt privé (à ne pas renommer ici seul).
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
            signingConfig = if (hasKey) signingConfigs.getByName("nestgoal") else signingConfigs.getByName("debug")
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
        include("index.html", "manifest.webmanifest", "css/**", "js/**", "fonts/**", "icons/**")
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

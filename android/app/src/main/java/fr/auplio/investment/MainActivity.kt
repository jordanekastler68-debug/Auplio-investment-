package fr.auplio.investment

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Auplio Investment sur Android : l'interface web (index.html, app.js, bank.js…) est rangée dans l'APK
 * et affichée par une WebView, entièrement hors ligne. Les données (IndexedDB + localStorage) restent
 * dans le stockage privé de l'appli : elles ne sont effacées que si l'appli est désinstallée.
 *
 * Pont JavaScript « AuplioAndroid » :
 *  - share(nom, contenu, texte) : envoie le fichier de données à l'autre téléphone (WhatsApp, mail…)
 *  - save(nom, contenu, type)   : enregistre un export dans Téléchargements/Auplio Investment
 *  - shareText(texte)           : envoie le code d'invitation (synchro) par WhatsApp, SMS…
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val night = ContextCompat.getColor(this, R.color.night)
        val root = FrameLayout(this).apply { setBackgroundColor(night) }
        web = WebView(this).apply { setBackgroundColor(night) }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Le contenu ne passe jamais sous la barre d'état, la barre de navigation ou le clavier.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowInsetsControllerCompat(window, root).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (e: ActivityNotFoundException) { }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // Import d'un relevé CSV ou d'un fichier de partage : on montre tous les fichiers,
            // car les gestionnaires de fichiers ne reconnaissent pas toujours le type des .csv.
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                return try {
                    pickFile.launch(Intent.createChooser(pick, "Choisir un fichier"))
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    callback.onReceiveValue(null)
                    true
                }
            }
        }
        web.addJavascriptInterface(Bridge(), "AuplioAndroid")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
            }
        })

        web.loadUrl("https://$HOST/assets/www/index.html")
    }

    override fun onPause() {
        super.onPause()
        // Filet de sécurité : l'appli sauvegarde déjà à chaque saisie.
        web.evaluateJavascript("try{state.updatedAt&&save()}catch(e){}", null)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        super.onDestroy()
    }

    private fun safeName(name: String) = name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "auplio.txt" }

    private fun shareFile(name: String, content: String, text: String) {
        val dir = File(cacheDir, "partage").apply { mkdirs() }
        val file = File(dir, safeName(name))
        file.writeText(content, Charsets.UTF_8)
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_STREAM, uri)
            if (text.isNotBlank()) putExtra(Intent.EXTRA_TEXT, text)
            clipData = ClipData.newRawUri(file.name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, "Envoyer les données"))
    }

    private fun saveToDownloads(name: String, content: String, mime: String): Boolean {
        if (Build.VERSION.SDK_INT < 29) {
            // Android 8 et 9 : pas d'accès direct à Téléchargements sans permission, on passe par le partage.
            runOnUiThread { shareFile(name, content, "") }
            return true
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, safeName(name))
            put(MediaStore.MediaColumns.MIME_TYPE, mime.ifBlank { "text/plain" })
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Auplio Investment")
        }
        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
        contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray(Charsets.UTF_8)) } ?: return false
        return true
    }

    inner class Bridge {
        @JavascriptInterface
        fun share(name: String, content: String, text: String) {
            runOnUiThread {
                try { shareFile(name, content, text) } catch (e: Exception) { }
            }
        }

        @JavascriptInterface
        fun save(name: String, content: String, mime: String): Boolean =
            try { saveToDownloads(name, content, mime) } catch (e: Exception) { false }

        @JavascriptInterface
        fun shareText(text: String) {
            runOnUiThread {
                try {
                    val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
                    startActivity(Intent.createChooser(send, "Envoyer"))
                } catch (e: Exception) { }
            }
        }

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME
    }

    companion object {
        private const val HOST = "appassets.androidplatform.net"
    }
}

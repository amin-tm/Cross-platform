package ir.pol.transfer;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class MainActivity extends Activity {
    private static final int FILE_PICKER_REQUEST = 1001;
    private static final String SHARE_PREFIX = "/__pol_native_share__/";
    private WebView webView;
    private ValueCallback<Uri[]> pendingFiles;
    private final Uri home = Uri.parse(BuildConfig.POL_SITE_URL);
    private final List<Uri> sharedUris = new ArrayList<>();
    private final List<String> sharedNames = new ArrayList<>();
    private String shareToken = "";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        collectShare(getIntent());
        webView = new WebView(this);
        setContentView(webView);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && home.getHost().equalsIgnoreCase(uri.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "برنامه‌ای برای باز کردن لینک پیدا نشد", Toast.LENGTH_SHORT).show(); }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!"https".equals(url.getScheme()) || !home.getHost().equalsIgnoreCase(url.getHost())) return null;
                String path = url.getPath();
                if (path == null || !path.startsWith(SHARE_PREFIX)) return null;
                String[] parts = path.substring(SHARE_PREFIX.length()).split("/");
                try {
                    if (parts.length != 2 || !parts[0].equals(shareToken)) return notFound();
                    int index = Integer.parseInt(parts[1]);
                    Uri file;
                    synchronized (sharedUris) {
                        if (index < 0 || index >= sharedUris.size()) return notFound();
                        file = sharedUris.get(index);
                    }
                    InputStream stream = getContentResolver().openInputStream(file);
                    if (stream == null) return notFound();
                    String mime = getContentResolver().getType(file);
                    return new WebResourceResponse(mime == null ? "application/octet-stream" : mime, null, stream);
                } catch (Exception e) { return notFound(); }
            }
            @Override public void onPageFinished(WebView view, String url) { deliverShare(); }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                try { startActivityForResult(params.createIntent(), FILE_PICKER_REQUEST); return true; }
                catch (ActivityNotFoundException e) { pendingFiles = null; callback.onReceiveValue(null); return false; }
            }
        });
        webView.setDownloadListener((url, agent, disposition, mime, size) -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (ActivityNotFoundException e) { Toast.makeText(this, "دانلود در مرورگر در دسترس نیست", Toast.LENGTH_SHORT).show(); }
        });
        webView.loadUrl(BuildConfig.POL_SITE_URL);
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
    }

    private void collectShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        List<Uri> incoming = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) incoming.add(one);
        } else {
            ArrayList<Uri> many = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (many != null) incoming.addAll(many);
        }
        ClipData clip = intent.getClipData();
        if (incoming.isEmpty() && clip != null) for (int i = 0; i < clip.getItemCount(); i++) {
            Uri uri = clip.getItemAt(i).getUri();
            if (uri != null) incoming.add(uri);
        }
        if (incoming.isEmpty()) return;
        synchronized (sharedUris) {
            sharedUris.clear(); sharedNames.clear();
            shareToken = UUID.randomUUID().toString();
            for (Uri uri : incoming) {
                if (sharedUris.size() >= 100) break;
                if (!"content".equals(uri.getScheme())) continue;
                sharedUris.add(uri);
                String name = "shared-file-" + sharedUris.size();
                try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (c != null && c.moveToFirst()) {
                        String value = c.getString(0);
                        if (value != null && !value.isEmpty()) name = value;
                    }
                } catch (Exception ignored) { }
                sharedNames.add(name);
            }
        }
    }

    private void deliverShare() {
        if (webView == null) return;
        JSONArray entries = new JSONArray();
        synchronized (sharedUris) {
            for (int i = 0; i < sharedUris.size(); i++) {
                JSONObject entry = new JSONObject();
                try {
                    entry.put("name", sharedNames.get(i));
                    entry.put("url", SHARE_PREFIX + shareToken + "/" + i);
                    String mime = getContentResolver().getType(sharedUris.get(i));
                    entry.put("type", mime == null ? "application/octet-stream" : mime);
                    entries.put(entry);
                } catch (Exception ignored) { }
            }
        }
        if (entries.length() == 0) return;
        String script = "window.__polPendingShare=" + entries.toString() + ";window.dispatchEvent(new Event('pol-native-share'));";
        webView.evaluateJavascript(script, null);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        collectShare(intent);
        if (webView != null) { webView.loadUrl(BuildConfig.POL_SITE_URL); }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_PICKER_REQUEST || pendingFiles == null) return;
        pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        pendingFiles = null;
    }
    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (pendingFiles != null) { pendingFiles.onReceiveValue(null); pendingFiles = null; }
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}

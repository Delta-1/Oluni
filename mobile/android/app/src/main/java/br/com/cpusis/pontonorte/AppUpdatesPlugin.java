package br.com.cpusis.pontonorte;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "AppUpdates")
public class AppUpdatesPlugin extends Plugin {
    private static final String FEED = "https://github.com/Delta-1/MoodCorp/releases/download/android-latest/update.json";
    private static final long MAX_APK = 150L * 1024 * 1024;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean installing = new AtomicBoolean(false);
    private volatile JSONObject offer;

    private int signingFlag() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    private PackageInfo installed() throws Exception { return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), signingFlag()); }
    private long version(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    private Signature[] signatures(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 && info.signingInfo != null ? info.signingInfo.getApkContentsSigners() : info.signatures;
    }
    private String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format("%02x", value & 255));
        return result.toString();
    }
    private String certificate(PackageInfo info) throws Exception {
        Signature[] values = signatures(info);
        if (values == null || values.length != 1) throw new Exception("Não foi possível validar a assinatura do aplicativo.");
        return hex(MessageDigest.getInstance("SHA-256").digest(values[0].toByteArray()));
    }
    private HttpURLConnection open(String address) throws Exception {
        for (int redirects = 0; redirects <= 5; redirects++) {
            if (!UpdatePolicy.allowedDownload(address)) throw new Exception("Origem de atualização não autorizada.");
            HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "PontoNorte-Android");
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                address = new URL(new URL(address), location).toString(); connection.disconnect(); continue;
            }
            if (status != 200) { connection.disconnect(); throw new Exception(status == 404 ? "NO_FEED" : "Não foi possível consultar a atualização."); }
            return connection;
        }
        throw new Exception("Redirecionamento de atualização inválido.");
    }
    private JSONObject feed() throws Exception {
        HttpURLConnection connection = open(FEED);
        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > 65536) throw new Exception("Informações de atualização inválidas.");
                output.write(buffer, 0, count);
            }
            return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        } finally { connection.disconnect(); }
    }
    @PluginMethod public void getInfo(PluginCall call) {
        try { PackageInfo info = installed(); JSObject result = new JSObject(); result.put("version", info.versionName); result.put("versionCode", version(info)); call.resolve(result); }
        catch (Exception error) { call.reject("Não foi possível consultar a versão instalada."); }
    }
    @PluginMethod public void check(PluginCall call) {
        worker.execute(() -> {
            try {
                JSONObject metadata = feed(); PackageInfo current = installed();
                if (!getContext().getPackageName().equals(metadata.optString("packageId")) || !UpdatePolicy.validHash(metadata.optString("sha256")) || !UpdatePolicy.officialApk(metadata.optString("url")) || metadata.optLong("size") < 1 || metadata.optLong("size") > MAX_APK) throw new Exception("Informações de atualização inválidas.");
                JSObject result = new JSObject(); boolean newer = metadata.getLong("versionCode") > version(current);
                boolean compatible = certificate(current).equalsIgnoreCase(metadata.optString("certificateSha256"));
                result.put("available", newer && compatible); result.put("incompatible", newer && !compatible); result.put("version", metadata.getString("versionName"));
                offer = newer && compatible ? metadata : null; call.resolve(result);
            } catch (Exception error) {
                offer = null;
                if ("NO_FEED".equals(error.getMessage())) { JSObject result = new JSObject(); result.put("available", false); result.put("notConfigured", true); call.resolve(result); }
                else call.reject("Não foi possível verificar atualizações. Seu ponto continua disponível.");
            }
        });
    }
    private String fileHash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] buffer = new byte[32768]; int count; while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count); }
        return hex(digest.digest());
    }
    private File download(JSONObject metadata) throws Exception {
        File folder = new File(getContext().getCacheDir(), "updates");
        if (!folder.exists() && !folder.mkdirs()) throw new Exception("Sem espaço para baixar a atualização.");
        File target = new File(folder, "PontoNorte-" + metadata.getLong("versionCode") + ".apk");
        if (target.isFile() && target.length() == metadata.getLong("size") && fileHash(target).equalsIgnoreCase(metadata.getString("sha256"))) return target;
        HttpURLConnection connection = open(metadata.getString("url"));
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[32768]; int count; long total = 0;
            while ((count = input.read(buffer)) != -1) { total += count; if (total > MAX_APK || total > metadata.getLong("size")) throw new Exception("Arquivo de atualização inválido."); output.write(buffer, 0, count); }
        } catch (Exception error) { target.delete(); throw error; }
        finally { connection.disconnect(); }
        if (target.length() != metadata.getLong("size") || !fileHash(target).equalsIgnoreCase(metadata.getString("sha256"))) { target.delete(); throw new Exception("A verificação do download falhou. Tente novamente."); }
        return target;
    }
    @PluginMethod public void install(PluginCall call) {
        JSONObject metadata = offer;
        if (metadata == null) { call.reject("Verifique as atualizações antes de instalar."); return; }
        if (!installing.compareAndSet(false, true)) { call.reject("Uma atualização já está em andamento."); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            installing.set(false);
            getActivity().runOnUiThread(() -> {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings); JSObject result = new JSObject(); result.put("permissionRequired", true); call.resolve(result);
            });
            return;
        }
        worker.execute(() -> {
            try {
                PackageInfo current = installed();
                if (metadata.getLong("versionCode") <= version(current)) throw new Exception("A versão instalada já está atualizada.");
                File apk = download(metadata);
                PackageInfo archive = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), signingFlag());
                if (archive == null || !current.packageName.equals(archive.packageName) || version(archive) != metadata.getLong("versionCode") || !certificate(current).equals(certificate(archive))) { apk.delete(); throw new Exception("A assinatura desta atualização não corresponde ao aplicativo instalado."); }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                getActivity().runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        getActivity().startActivity(intent); JSObject result = new JSObject(); result.put("installerOpened", true); call.resolve(result);
                    } catch (Exception error) { call.reject("Não foi possível abrir o instalador do Android."); }
                    finally { installing.set(false); }
                });
            } catch (Exception error) { installing.set(false); call.reject(error.getMessage()); }
        });
    }
    @Override protected void handleOnDestroy() { worker.shutdownNow(); super.handleOnDestroy(); }
}

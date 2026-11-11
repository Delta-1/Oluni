package br.com.oluni.app;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

final class UpdatePolicy {
    private static final Set<String> HOSTS = new HashSet<>(Arrays.asList(
        "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"
    ));
    static boolean allowedDownload(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equals(uri.getScheme()) && HOSTS.contains(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (RuntimeException error) { return false; }
    }
    static boolean validHash(String value) { return value != null && value.matches("[a-fA-F0-9]{64}"); }
    static boolean officialApk(String value) {
        return allowedDownload(value) && value.matches("https://github\\.com/Delta-1/Oluni/releases/download/android-v[0-9]+/Oluni\\.apk");
    }
}

package br.com.cpusis.pontonorte;

import android.app.KeyguardManager;
import android.content.Context;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "DeviceAuth")
public class DeviceAuthPlugin extends Plugin {
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK |
        BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        boolean available = manager.canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS
            || (keyguard != null && keyguard.isDeviceSecure());
        JSObject result = new JSObject();
        result.put("available", available);
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            FragmentActivity activity = (FragmentActivity) getActivity();
            Executor executor = ContextCompat.getMainExecutor(activity);
            BiometricPrompt prompt = new BiometricPrompt(
                activity,
                executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        call.resolve();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errorMessage) {
                        super.onAuthenticationError(errorCode, errorMessage);
                        call.reject(errorMessage.toString(), String.valueOf(errorCode));
                    }
                }
            );

            String title = call.getString("title", "Desbloquear PontoNorte");
            String subtitle = call.getString("subtitle", "Confirme sua identidade no aparelho");
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build();
            prompt.authenticate(promptInfo);
        });
    }
}

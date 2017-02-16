package net.coolmaze.coolmaze;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.Vibrator;
import android.provider.Settings;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.View;
import android.widget.ImageView;
import android.widget.ProgressBar;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.AsyncHttpResponseHandler;
import com.loopj.android.http.BlackholeHttpResponseHandler;

/**
 * Created by valou on 9/28/16.
 */
public abstract class BaseActivity extends AppCompatActivity {
    //static final String FRONTPAGE_DOMAIN = "coolmaze.net";  deprecated
    static final String FRONTPAGE_DOMAIN = "coolmaze.io";
    static final String FRONTPAGE_URL = "https://" + FRONTPAGE_DOMAIN;
    static final String BACKEND_URL = "https://cool-maze.appspot.com";
    // static final String BACKEND_URL = "https://dev-dot-cool-maze.appspot.com";

    static final String SCAN_INVITE = "Open " + FRONTPAGE_DOMAIN + " on target computer and scan!";
    static final AsyncHttpResponseHandler blackhole = new BlackholeHttpResponseHandler();

    protected String qrKeyToSignal = "<?>";

    // Scanning and Uploading occur concurrently, they need synchronization.
    protected Object workflowLock = new Object();

    protected boolean finishedScanning = false;

    // "Hold on while I'm requesting permissions". Then, use the intent in the onRequestPermissionsResult callback.
    protected Intent holdOnIntent;

    //static final int MAX_UPLOAD_SIZE = XX * 1024 * 1024; Issue #101: max size is now checked server-side

    boolean checkCameraPermission() {
        // Cool-Maze can't work at all without access to Camera.

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Version >= 23
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                return false;
        } else {
            // Version < 23 : we just assume permissions were accepted at installation
        }
        return true;
    }

    void requestCameraPermission(){
        // Cool-Maze can't work at all without access to Camera.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int requestCode = 111; // Arbitrary, for my camera request
            requestPermissions( new String[]{
                    Manifest.permission.CAMERA,
            }, requestCode);
        }
    }

    boolean checkStoragePermission() {
        // We should in principle not need READ_EXTERNAL_STORAGE,
        // but we sometimes do, depending on content provider (source app).

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Version >= 23
            if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
                return false;
        } else {
            // Version < 23 : we just assume permissions were accepted at installation
        }
        return true;
    }

    void requestStoragePermission(){
        // We should in principle not request READ_EXTERNAL_STORAGE,
        // but we're sometimes forced to, depending on content provider (source app).

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int requestCode = 222; // Arbitrary, for my storage request
            requestPermissions( new String[]{
                    Manifest.permission.READ_EXTERNAL_STORAGE,
            }, requestCode);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String permissions[], int[] grantResults) {
        switch(requestCode){
            case 111:
                if ( checkCameraPermission() )
                    // User agreed
                    scanAndSend(holdOnIntent);
                else
                    // User refused
                    finish();
                return;
            case 222:
                if ( checkStoragePermission() )
                    // User agreed
                    scanAndSend(holdOnIntent);
                else
                    // User refused
                    finish();
                return;
        }
    }

    //
    // Warning:
    // onResume() is called first when User hits "Share via ... Cool Maze",
    // and it is called again after onActivityResult().
    // Also, the activity may have been recreated inbetween.
    // Yay, spaghetti workflow.
    //

    @Override
    protected void onResume() {
        Log.i("CoolMazeLogEvent", BaseActivity.this.hashCode() + ".onResume()");
        super.onResume();

        // Get intent, action and MIME type
        Intent intent = getIntent();
        Log.i("CoolMazeLogEvent", "Intent="+intent);
        if ( intent == null || finishedScanning )
            return;

        if ( !Intent.ACTION_SEND.equals(intent.getAction()) && !Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()) )
            return;  // MAIN, etc.

        // For ACTION_SEND_MULTIPLE, see MultipleFileActivity.scanAndSend(Intent)

        if ( !isOnline() ){
            showError("No internet access found.");
            return;
        }

        if (!checkCameraPermission()){
            holdOnIntent = intent;
            requestCameraPermission();
            return;
        }

        scanAndSend(intent);
        // "consume the intent" so it won't be processed again
        // (note that this is not sufficient in case of recreation)
        setIntent(null);
    }

    abstract void scanAndSend(Intent intent);

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        Log.i("CoolMazeLogEvent", BaseActivity.this.hashCode() + ".onRestoreInstanceState(Bundle)");
        super.onRestoreInstanceState(savedInstanceState);
        finishedScanning = savedInstanceState.getBoolean("finishedScanning");
        qrKeyToSignal = savedInstanceState.getString("qrKeyToSignal");
    }

    @Override
    public void onRestoreInstanceState(Bundle savedInstanceState, PersistableBundle persistentState) {
        Log.i("CoolMazeLogEvent", BaseActivity.this.hashCode() + ".onRestoreInstanceState(Bundle, PersistableBundle)");
        super.onRestoreInstanceState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        Log.i("CoolMazeLogEvent", BaseActivity.this.hashCode() + ".onSaveInstanceState(Bundle)");
        super.onSaveInstanceState(outState);
        outState.putBoolean("finishedScanning", finishedScanning);
        outState.putString("qrKeyToSignal", qrKeyToSignal);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        Log.i("CoolMazeLogEvent", BaseActivity.this.hashCode() + ".onActivityResult(" + requestCode + ", " + resultCode + ", " + data + ")");
        super.onActivityResult(requestCode, resultCode, data);

        //
        // User returns from the "Scan QR-code with camera" intent.
        //

        if (resultCode == RESULT_CANCELED) {
            // User was on the Scan screen, but hit her Back button or similar
            Log.i("CoolMazeLogEvent", "Scan was canceled by user");
            finish();
            return;
        }

        if (!isOnline()) {
            showError("No internet access found.");
            return;
        }

        IntentResult scanResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scanResult == null) {
            Log.e("CoolMazeLogError", "IntentResult parsing by ZXing failed :(");
            return;
        }

        Log.i("CoolMazeLogEvent", "IntentResult successfully parsed by ZXing");
        qrKeyToSignal = scanResult.getContents();

        /*
        This check was too strict, it made the qrKey format change less flexible.
        Also, the showError call doesn't work well for some reason.
        Also, it would be better to catch backend error "qrKey must be valid" and then display the error message.
        if (!isValidQrKey(qrKeyToSignal)) {
            setContentView(R.layout.activity_main);
            showError("Please open webpage coolmaze.io on your computer and scan its QR-code.");
            finish();
            // Try again
            //new IntentIntegrator(MainActivity.this)
            //        .addExtra("PROMPT_MESSAGE", SCAN_INVITE)
            //        .initiateScan();
            return;
        }
        */

        // This short vibration means "Hey cool, you've just scanned something!"
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        v.vibrate(100);

        sendPending();
    }

    /**
     * Just after QR scan (which provides target ID), trigger the dispatch
     * of ready-to-deliver messages (e.g. a fresh file URL).
     */
    abstract void sendPending();

    void showSpinning(){
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                ProgressBar progress = ((ProgressBar) findViewById(R.id.progressBar));
                if(progress!=null)
                    progress.setVisibility(View.VISIBLE);
                ImageView check = ((ImageView) findViewById(R.id.checkMark));
                if(check!=null)
                    check.setVisibility(View.INVISIBLE);
            }
        });
    }

    void displayFinished() {
        Log.i("CoolMazeLog", "displayFinished()");
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        v.vibrate(500);
        showSuccess();
        closeCountdown(4);
    }

    void showSuccess(){
        showCaption("Sent!");
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                ProgressBar progress = ((ProgressBar) findViewById(R.id.progressBar));
                if(progress!=null)
                    progress.setVisibility(View.INVISIBLE);
                ImageView check = ((ImageView) findViewById(R.id.checkMark));
                if(check!=null)
                    check.setVisibility(View.VISIBLE);
            }
        });
    }

    void showCaption(final String title){
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toolbar toolbar = ((Toolbar) findViewById(R.id.toolbar));
                toolbar.setTitle(title);
            }
        });
    }

    void closeCountdown(int seconds) {
        Handler handler = new Handler(Looper.getMainLooper());
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                finish();
            }
        }, 1000 * seconds);
    }

    void wakeupBackend() {
        // Send a kind of custom warmup request to the backend.
        // Make it async and ignore the response.

        // This is called only when sharing short text or URL.
        // It is not used for file upload because the request to /new-gcs-urls already warms up a backend instance.

        newAsyncHttpClient().get(BACKEND_URL + "/wakeup", blackhole);
    }

    AsyncHttpClient newAsyncHttpClient(){
        // TODO: reuse them instead of instantiating each time...?
        AsyncHttpClient client = new AsyncHttpClient();
        String cmDeviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        client.addHeader("User-Agent", "Cool Maze android app, build " + BuildConfig.BUILD_DATE + " device " + cmDeviceId);
        return client;
    }

    void showError(String message){
        Log.e("CoolMazeLogError", "Alert dialog [" + message + "]");
        new AlertDialog.Builder(this)
                .setTitle("Error :(")
                .setMessage(message)
                .setIcon(android.R.drawable.ic_dialog_alert)
                .setOnDismissListener(new DialogInterface.OnDismissListener() {
                    @Override
                    public void onDismiss(DialogInterface dialog) {
                        finish();
                    }
                })
                .show();
    }

    void apologizeForStoragePermission(){
        new AlertDialog.Builder(this)
                .setTitle("Cool Maze")
                .setMessage("We're afraid this specific resource will need access to your device storage.\n"
                        + "\n"
                        + "We apologize for the rather intrusive request that comes next.")
                .setIcon(R.mipmap.ic_launcher)
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int id) {
                        requestStoragePermission();
                    }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    @Override
                    public void onCancel(DialogInterface dialog) {
                        BaseActivity.this.finish();
                    }
                })
                .show();
    }

    // From http://stackoverflow.com/a/4009133/871134
    public boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo netInfo = cm.getActiveNetworkInfo();
        return netInfo != null && netInfo.isConnectedOrConnecting();
    }
}

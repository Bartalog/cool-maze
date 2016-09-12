package net.coolmaze.coolmaze;

import android.Manifest;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.ThumbnailUtils;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.View;
import android.webkit.MimeTypeMap;
import android.widget.ImageView;
import android.widget.ProgressBar;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;

import com.loopj.android.http.*;
import org.json.JSONException;
import org.json.JSONObject;
import cz.msebera.android.httpclient.Header;
import cz.msebera.android.httpclient.entity.InputStreamEntity;
import cz.msebera.android.httpclient.message.BasicHeader;

public class MainActivity extends AppCompatActivity {
    static final String FRONTPAGE_DOMAIN = "coolmaze.net";
    //static final String FRONTPAGE_DOMAIN = "coolmaze.io";   maybe later
    static final String FRONTPAGE_URL = "https://" + FRONTPAGE_DOMAIN;
    static final String BACKEND_URL = "https://cool-maze.appspot.com";
    // static final String BACKEND_URL = "https://dev-dot-cool-maze.appspot.com";

    //static final int MAX_UPLOAD_SIZE = XX * 1024 * 1024; Issue #101: max size is now checked server-side

    static final String SCAN_INVITE = "Open " + FRONTPAGE_DOMAIN + " on target computer and scan it!";
    static final AsyncHttpResponseHandler blackhole = new BlackholeHttpResponseHandler();

    private String qrKeyToSignal = "<?>";
    private String messageToSignal = "<?>";
    private String thumbnailDataURI = "<?>";
    private String gcsObjectName = null;
    private String resourceHash = null;

    // Scanning and Uploading occur concurrently, they need synchronization.
    private Object workflowLock = new Object();
    private boolean finishedScanning = false;
    private boolean finishedUploading = false;

    // "Hold on while I'm requesting permissions". Then, use the intent in the onRequestPermissionsResult callback.
    private Intent holdOnIntent;

    boolean checkPermissions() {
        // Cool-Maze can't work at all without acces to Camera.
        // Also, it (currently) needs READ_EXTERNAL_STORAGE when sending a file.

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Version >= 23
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                return false;
            if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
                return false;
        } else {
            // Version < 23 : we just assume permission were accepted at installation
        }
        return true;
    }

    void requestPermissions(){
        // Cool-Maze can't work at all without acces to Camera.
        // Also, it (currently) needs READ_EXTERNAL_STORAGE when sending a file.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int requestCode = 0; //??
            requestPermissions( new String[]{
                    Manifest.permission.CAMERA,
                    Manifest.permission.READ_EXTERNAL_STORAGE,
            }, requestCode);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String permissions[], int[] grantResults) {
        if ( checkPermissions() )
            scanAndSend(holdOnIntent);
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
        Log.i("CoolMazeLogEvent", MainActivity.this.hashCode() + ".onResume()");
        super.onResume();

        // Get intent, action and MIME type
        Intent intent = getIntent();
        Log.i("CoolMazeLogEvent", "Intent="+intent);
        Log.i("CoolMazeLogEvent", "finishedScanning==" + finishedScanning + ", finishedUploading==" + finishedUploading);
        if ( intent == null || finishedScanning )
            return;

        if ( !Intent.ACTION_SEND.equals(intent.getAction()) )
            return;  // MAIN, etc.

        if ( !isOnline() ){
            showError("No internet access found.");
            return;
        }

        // This is useless because either /dispatch or /new-gcs-urls is
        // called at the same time so backend will be awaken anyway.
        //wakeupBackend();

        if (!checkPermissions()){
            holdOnIntent = intent;
            requestPermissions();
            return;
        }

        scanAndSend(intent);
        // "consume the intent" so it won't be processed again
        // (note that this is not sufficient in case of recreation)
        setIntent(null);
    }

    void scanAndSend(Intent intent) {
        String type = intent.getType();
        String[] typeParts = type.split("/");
        String typeCat = typeParts[0];
        switch (typeCat) {
            case "text":
                // Short text, URL, etc. are sent directly to the broker
                // (no need to upload a file)
                messageToSignal = intent.getStringExtra(Intent.EXTRA_TEXT);
                finishedScanning = false;
                finishedUploading = true;
                Log.i("CoolMazeLogEvent", MainActivity.this.hashCode() + " finishedScanning==" + finishedScanning + ", finishedUploading==" + finishedUploading);
                resourceHash = null;
                gcsObjectName = null;

                new IntentIntegrator(MainActivity.this)
                        //.setOrientationLocked(false)
                        .addExtra("PROMPT_MESSAGE", SCAN_INVITE)
                        .initiateScan();
                return;
            case "image":
            case "video":
            case "audio":
            case "application":
                // 1) We request a pair of upload/download URLs from the backend
                // 2) We upload the file
                // 3) We send the download URL to the broker
                Uri localFileUri = intent.getData();
                if ( localFileUri == null ) {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN) {
                        ClipData clip = intent.getClipData();
                        if ( clip.getItemCount() == 0 ) {
                            Log.e("CoolMazeLogSignal", "ClipData having 0 item :(");
                            return;
                    }
                        ClipData.Item item = clip.getItemAt(0);
                        localFileUri = item.getUri();
                    }else{
                        Log.e("CoolMazeLogSignal", "Intent.getClipData() needs at least JELLY_BEAN :(");
                        return;
                    }
                }
                Log.i("CoolMazeLogStart", "Initiating upload of " + localFileUri + " ...");
                setContentView(R.layout.activity_main);
                showSpinning();
                showCaption("Uploading...");

                finishedScanning = false;
                finishedUploading = false;
                resourceHash = null;
                gcsObjectName = null;
                String mimeType = extractMimeType(intent, localFileUri);
                gentleUploadStep1(localFileUri, mimeType);
                return;
            default:
                // TODO other types of files?
                Log.w("CoolMazeLogStart", "Intent type is " + intent.getType());
                return;
        }
    }

    String extractMimeType(Intent intent, Uri localFileUri) {
        // Trying strategies that work in most cases: photos, videos, pdf, etc,
        // should work fine for "file://..." and "content://..." as well.
        String mimeType = intent.getType();
        if ( mimeType==null || "".equals(mimeType) || mimeType.endsWith("/*") ){
            //String resolved = MimeTypeMap.getSingleton().getExtensionFromMimeType(getContentResolver().getType(localFileUri));
            String resolved = getContentResolver().getType(localFileUri);
            if ( resolved!=null )
                mimeType = resolved;
            else {
                String fileExtension = MimeTypeMap.getFileExtensionFromUrl(localFileUri.toString());
                resolved = MimeTypeMap.getSingleton().getMimeTypeFromExtension(fileExtension.toLowerCase());
                if ( resolved!=null )
                    mimeType = resolved;
            }
        }
        // TODO: what about application/txt ?
        // Are all video formats properly handled?
        // Should we default image/*, video/* to some more specific value?
        return mimeType;
    }

    //
    // Activity will be destroyed and recreated each time the user rotates the screen.
    // Also, when the needs to free some memory.
    // Restoring state is not 100% automatic, we need to override onSaveInstanceState()
    // and onRestoreInstanceState() for member values.

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        Log.i("CoolMazeLogEvent", MainActivity.this.hashCode() + ".onRestoreInstanceState(Bundle)");
        super.onRestoreInstanceState(savedInstanceState);
        finishedScanning = savedInstanceState.getBoolean("finishedScanning");
        finishedUploading = savedInstanceState.getBoolean("finishedUploading");
        qrKeyToSignal = savedInstanceState.getString("qrKeyToSignal");
        messageToSignal = savedInstanceState.getString("messageToSignal");
        thumbnailDataURI = savedInstanceState.getString("thumbnailDataURI");
        gcsObjectName = savedInstanceState.getString("gcsObjectName");
        resourceHash = savedInstanceState.getString("resourceHash");
    }

    @Override
    public void onRestoreInstanceState(Bundle savedInstanceState, PersistableBundle persistentState) {
        Log.i("CoolMazeLogEvent", MainActivity.this.hashCode() + ".onRestoreInstanceState(Bundle, PersistableBundle)");
        super.onRestoreInstanceState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        Log.i("CoolMazeLogEvent", MainActivity.this.hashCode() + ".onSaveInstanceState(Bundle)");
        super.onSaveInstanceState(outState);
        outState.putBoolean("finishedScanning", finishedScanning);
        outState.putBoolean("finishedUploading", finishedUploading);
        outState.putString("qrKeyToSignal", qrKeyToSignal);
        outState.putString("messageToSignal", messageToSignal);
        outState.putString("thumbnailDataURI", thumbnailDataURI);
        outState.putString("gcsObjectName", gcsObjectName);
        outState.putString("resourceHash", resourceHash);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        Log.i("CoolMazeLogEvent", MainActivity.this.hashCode() + ".onActivityResult(" + requestCode + ", " + resultCode + ", " + data + ")");
        Log.i("CoolMazeLogEvent", "finishedScanning==" + finishedScanning + ", finishedUploading==" + finishedUploading);
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
        Also, it would be better to catch backend error "invalid qrKey" and then display the error message.
        if (!isValidQrKey(qrKeyToSignal)) {
            setContentView(R.layout.activity_main);
            showError("Please open webpage coolmaze.net on your computer and scan its QR-code.");
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

        boolean dispatchNow = false;
        synchronized (workflowLock) {
            finishedScanning = true;
            if (finishedUploading)
                dispatchNow = true;
        }
        if (dispatchNow)
            dispatch();
        else
            notifyScan();
    }

    void notifyScan() {
        // This is a small request sent in the background. It shows nothing on the Android device screen.
        // It should however show some acknowledgement on the freshly scanned coolmaze.net browser tab.
        // It may contain a thumbnail to display on target.
        //
        // It is optional (workflow not broken if notif is lost, or not sent at all).
        // If the payload is a small piece of text, notifyScan() is not called.
        // If the upload is already complete before the scan is complete, notifyScan() is not called.

        RequestParams params = new RequestParams("qrKey", qrKeyToSignal);
        synchronized (workflowLock) {
            if (thumbnailDataURI != null && !"<?>".equals(thumbnailDataURI)) {
                params.add("thumb", thumbnailDataURI);
                Log.i("CoolMazeLogEvent", "Sending scan notif to " + qrKeyToSignal + " with thumbnail of size " + thumbnailDataURI.length());
            } else
                Log.i("CoolMazeLogEvent", "Sending scan notif to " + qrKeyToSignal);
        }
        newAsyncHttpClient().post(
                BACKEND_URL + "/scanned",
                params,
                //blackhole);
                new AsyncHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                        Log.i("CoolMazeLogEvent", "Scan notif SUCCESS ");
                    }
                    @Override
                    public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                        Log.e("CoolMazeLogEvent", "Scan notif FAILED ", e);
                    }
                });

    }

    // Here "dispatch" means "send message to broker, for immediate delivery to target".
    // It is triggered either after Scan or after Upload, depending which one arrives last.
    //
    // In case the resource is a file, when dispatch is called the file is already completely
    // uploaded, and the message consists in the file download URL.
    void dispatch(){
        Log.i("CoolMazeLogEvent", "Sending to " + qrKeyToSignal + " message [" + messageToSignal + "]");
        if ( "<?>".equals(messageToSignal) ){
            showError("Unfortunately, we're experiencing bug #55. The message was not sent to the dispatch server.");
            return;
        }
        RequestParams params = new RequestParams("qrKey", qrKeyToSignal, "message", messageToSignal, "gcsObjectName", gcsObjectName, "hash", resourceHash);
        // conn.setReadTimeout(15000);
        // conn.setConnectTimeout(15000);
        newAsyncHttpClient().post(
                BACKEND_URL + "/dispatch",
                params,
                new AsyncHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                        Log.i("CoolMazeLogEvent", MainActivity.this.hashCode() + ".sendMessage successful POST");
                        // This long vibration should mean "The target has received your message!",
                        // ...but it doesn't, yet.
                        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                        v.vibrate(500);
                        showSuccess();
                        closeCountdown(2);
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                        Log.e("CoolMazeLogEvent", MainActivity.this.hashCode() + ".sendMessage POST request response code " + statusCode);
                        showError("Unfortunately, we could not send this message to the dispatch server.");
                    }
                });

        // Show some feedback on the screen
        setContentView(R.layout.activity_main);
        showSpinning();
        showCaption("Sending to target...");
    }

    boolean isValidQrKey(String s) {
        // A valid qrKey is a string encoded in a QR-code on page coolmaze.net .
        // Since #108 a valid qrKey is string of exactly 11 characters
        // from 62-char-set [0-9a-zA-Z].
        return s.matches("^[0-9a-zA-Z]{11}$");

        // TODO maybe relax this check?
        // This would make format change easier, no need to update app.
    }

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

    void gentleUploadStep1(final Uri localFileUri, final String mimeType) {

        // 22 lines to: check the upload file size before opening camera!
        int resourceSize;
        InputStream inputStream = null;
        try {
            inputStream = getContentResolver().openInputStream(localFileUri);
            resourceSize = inputStream.available();
            /*
            See issue #101 : enforced upload size limit server-side instead.
            if (resourceSize > MAX_UPLOAD_SIZE) {
                Log.e("CoolMazeLog", "File too big to upload : " + resourceSize + " > " + MAX_UPLOAD_SIZE);
                showError("This file is too big (" + (resourceSize/(1024*1024)) + "MB), I can't upload it.\n\n"
                        + "Max upload size is " + (MAX_UPLOAD_SIZE/(1024*1024)) + "MB.");
                return;
            }
            */

            // TODO do this in background, don't block UI (camera opening) while computing!
            generateThumbnail(inputStream, localFileUri, mimeType);
        } catch (FileNotFoundException e) {
            Log.e("CoolMazeLogUpload", "Not found :( " + e);
            return;
        } catch (IOException e) {
            Log.e("CoolMazeLogUpload", "Can't determine resource size " + e);
            return;
        } finally {
            if( inputStream != null)
                try {
                    inputStream.close();
                } catch (IOException e) {
                }
        }

        // See issue #32: server file hash-based cache.
        resourceHash = hash(localFileUri);

        newAsyncHttpClient().post(
                BACKEND_URL + "/new-gcs-urls",
                new RequestParams("type", mimeType, "filesize", resourceSize, "hash", resourceHash),
                new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject response) {
                        Log.i("CoolMazeLogEvent", "Signed URLs request success :) \n ");
                        try {
                            boolean alreadyExists = response.getBoolean("existing");
                            if(alreadyExists) {
                                // Yeepee, we don't have to upload anything.
                                Log.i("CoolMazeEvent", "Resource already known in server cache :)");
                                String urlGet = response.getString("urlGet");
                                messageToSignal = urlGet;
                                gcsObjectName = response.optString("gcsObjectName");

                                boolean dispatchNow = false;
                                synchronized (workflowLock) {
                                    finishedUploading = true;
                                    if ( finishedScanning )
                                        dispatchNow = true;
                                }
                                if(dispatchNow)
                                    dispatch();
                                return;
                            }

                            String urlPut = response.getString("urlPut");
                            String urlGet = response.getString("urlGet");
                            gcsObjectName = response.optString("gcsObjectName");
                            gentleUploadStep2(urlPut, urlGet, localFileUri, mimeType);
                        } catch (JSONException e) {
                            Log.e("CoolMazeLogSignal", "JSON signed URLs extract failed :( from " + response);
                        }
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, Throwable throwable, JSONObject errorResponse) {
                        // Issue #112: Unfortunately, user won't see the error message box until she has finished scanning :(

                        if(statusCode==412){
                            // PRECONDITION_FAILED
                            try {
                                String message = errorResponse.getString("message");
                                showError(message);
                            } catch (JSONException e) {
                                e.printStackTrace();
                            }
                            return;
                        }

                        showError("Unfortunately, we could not obtain secure upload URLs.");
                    }
                });

        // This begins *while uploading is still working*
        new IntentIntegrator(MainActivity.this)
                //.setOrientationLocked(false)
                .addExtra("PROMPT_MESSAGE", SCAN_INVITE)
                .initiateScan();
    }

    private void generateThumbnail(InputStream inputStream, Uri localFileUri, String mimeType) {
        if ( !thumbnailable(mimeType) ) {
            Log.i("CoolMazeLogThumb", "No thumbnail generation for resource type " + mimeType);
            return;
        }

        long tip = System.currentTimeMillis();
        Bitmap thumbBitmap;

        if(mimeType.startsWith("image/"))
            thumbBitmap = ThumbnailUtils.extractThumbnail(BitmapFactory.decodeStream(inputStream), 256, 192);
        else if(mimeType.startsWith("video/")) {
            // MINI_KIND is 512x384
            Bitmap videoThumbBitmap = ThumbnailUtils.createVideoThumbnail(localFileUri.getPath(), MediaStore.Images.Thumbnails.MINI_KIND);
            if(videoThumbBitmap==null) {
                Log.i("CoolMazeLogThumb", "Cannot generate thumbnail for this video.");
                return;
            }
            if(videoThumbBitmap.getHeight() > videoThumbBitmap.getWidth())
                // Portrait
                thumbBitmap = Bitmap.createScaledBitmap(videoThumbBitmap, 192, 256, true);
            else
                // Landscape
                thumbBitmap = Bitmap.createScaledBitmap(videoThumbBitmap, 256, 192, true);
        } else {
            Log.e("CoolMazeLogThumb", "Unsupported resource type " + mimeType);
            return;
        }

        int quality = 90;
        String data;
        do {
            quality -= 20;
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            thumbBitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream);
            byte[] thumbBytes = outputStream.toByteArray();
            int flags = 0;
            data = "data:image/png;base64," + Base64.encodeToString(thumbBytes, flags);
        } while( data.length()>7000 && quality>25 );
        long top = System.currentTimeMillis();
        Log.i("CoolMazeLogThumb", "Generated thumbnail string of quality " + quality + ", size " + data.length() + ", in " + (top-tip) + "ms");
        synchronized (workflowLock) {
            thumbnailDataURI = data;
        }
    }

    private boolean thumbnailable(String mimeType) {
        if(mimeType==null)
                return false;
        if(mimeType.startsWith("image/"))
                return true;
        if(mimeType.startsWith("video/"))
            return true;   // see https://developer.android.com/reference/android/media/ThumbnailUtils.html#createVideoThumbnail(java.lang.String,%20int)
        // TODO: handle more types? pdf icons, etc.
        return false;
    }


    void gentleUploadStep2(String resourcePutUrl, final String resourceGetUrl, Uri localFileUri, final String mimeType) {
        File localFile = new File(localFileUri.getPath());
        // FileEntity entity = new FileEntity(localFile);
        // Resource URIs like "content://..." don't work well as Files, better as InputStreams
        InputStream inputStream;
        try {
            inputStream = getContentResolver().openInputStream(localFileUri);
        } catch (FileNotFoundException e) {
            Log.e("CoolMazeLogUpload", "Not found :( " + e);
            return;
        }

        InputStreamEntity entity = new InputStreamEntity(inputStream);
        Context context = null; // ?

        Log.i("CoolMazeLogEvent", "Uploading resource " + resourcePutUrl.split("\\?")[0] );
        newAsyncHttpClient().put(
                context,
                resourcePutUrl,
                new Header[]{ new BasicHeader("Content-Type", mimeType) },
                entity,
                mimeType,
                new AsyncHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                        Log.i("CoolMazeLogSignal", "Upload resource success :)");

                        // When the target desktop receives the URL, it immediately follows it
                        messageToSignal = resourceGetUrl;

                        boolean dispatchNow = false;
                        synchronized (workflowLock) {
                            finishedUploading = true;
                            if ( finishedScanning )
                                dispatchNow = true;
                        }
                        if(dispatchNow)
                            dispatch();
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                        String errorResponseStr = errorResponse==null ? "[]" : "["+new String(errorResponse)+"]";
                        Log.e("CoolMazeLogSignal", "Upload resource failed :( with status " + statusCode + " " + errorResponseStr, e);
                        showError("Unfortunately, the upload failed.");
                    }
                });
    }

    void wakeupBackend() {
        // Send a kind of custom warmup request to the backend.
        // Make it async and ignore the response.
        newAsyncHttpClient().get(BACKEND_URL + "/wakeup", blackhole);
    }

    AsyncHttpClient newAsyncHttpClient(){
        // TODO: reuse them instead of instantiating each time...?
        AsyncHttpClient client = new AsyncHttpClient();
        client.addHeader("User-Agent", "Cool Maze android app");
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

    // From http://stackoverflow.com/a/4009133/871134
    public boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo netInfo = cm.getActiveNetworkInfo();
        return netInfo != null && netInfo.isConnectedOrConnecting();
    }


    // From http://stackoverflow.com/a/23421126/871134
    String hash(android.net.Uri uri) {
        // This is currently a MD5 hash.
        // But any other (good and fast) hash algo would do.
        MessageDigest md = null;
        try {
            md = MessageDigest.getInstance("MD5");
            BufferedInputStream is = new BufferedInputStream(getContentResolver().openInputStream(uri));
            DigestInputStream dis = new DigestInputStream(is, md);
            byte[] buffer = new byte[1024];
            while(dis.read(buffer, 0, buffer.length) != -1) ;

            return toHexString(md.digest());
        } catch(Exception e) {
            Log.e("CoolMazeSignal", "Computing file hash: " + e);
        }
        return "";
    }

    // From http://stackoverflow.com/a/332101/871134
    public static String toHexString(byte[] bytes) {
        StringBuilder hexString = new StringBuilder();

        for (int i = 0; i < bytes.length; i++) {
            String hex = Integer.toHexString(0xFF & bytes[i]);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }

        return hexString.toString();
    }
}

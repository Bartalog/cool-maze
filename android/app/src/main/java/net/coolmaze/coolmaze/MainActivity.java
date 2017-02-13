package net.coolmaze.coolmaze;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.Vibrator;
import android.util.Log;
import com.google.zxing.integration.android.IntentIntegrator;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

import com.loopj.android.http.*;
import org.json.JSONException;
import org.json.JSONObject;
import cz.msebera.android.httpclient.Header;
import cz.msebera.android.httpclient.entity.InputStreamEntity;
import cz.msebera.android.httpclient.message.BasicHeader;

public class MainActivity extends BaseActivity {

    protected String messageToSignal = "<?>";
    protected String thumbnailDataURI = "<?>";
    protected String gcsObjectName = null;
    protected String resourceHash = null;
    protected String resourceFilename = null;

    protected boolean finishedUploading = false;

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        finishedUploading = savedInstanceState.getBoolean("finishedUploading");
        messageToSignal = savedInstanceState.getString("messageToSignal");
        thumbnailDataURI = savedInstanceState.getString("thumbnailDataURI");
        gcsObjectName = savedInstanceState.getString("gcsObjectName");
        resourceHash = savedInstanceState.getString("resourceHash");
        resourceFilename = savedInstanceState.getString("resourceFilename");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putBoolean("finishedUploading", finishedUploading);
        outState.putString("messageToSignal", messageToSignal);
        outState.putString("thumbnailDataURI", thumbnailDataURI);
        outState.putString("gcsObjectName", gcsObjectName);
        outState.putString("resourceHash", resourceHash);
        outState.putString("resourceFilename", resourceFilename);
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
                resourceFilename = null;
                gcsObjectName = null;

                wakeupBackend();

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
                    if ( android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.JELLY_BEAN) {
                        showError("This Cool Maze share requires at least Android 4.1 (Jelly Bean)");
                        // TODO: is JELLY_BEAN the real threshold?
                        // for getClipData(), getParcelableExtra(), or other feature?
                        return;
                    }

                    localFileUri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
                    boolean granted = checkUriPermission(localFileUri, Binder.getCallingPid(), Binder.getCallingUid(), Intent.FLAG_GRANT_READ_URI_PERMISSION)== PackageManager.PERMISSION_GRANTED;
                    if(granted) {
                        // Most apps (Gallery, Gmail, Music, Videos, SMS) grant fine-grained
                        // per-URI permissions just fine.
                        // localFileUri usually looks like "content://...".
                    }else{
                        if(!checkStoragePermission()) {
                            holdOnIntent = intent;
                            apologizeForStoragePermission(intent);
                            return;
                        }
                    }
                }
                Log.i("CoolMazeLogStart", "Initiating upload of " + localFileUri + " ...");
                setContentView(R.layout.activity_main);
                showSpinning();
                showCaption("Uploading...");

                finishedScanning = false;
                finishedUploading = false;
                resourceHash = null;
                resourceFilename = null;
                gcsObjectName = null;
                String mimeType = Util.extractMimeType(getContentResolver(), intent, localFileUri);
                gentleUploadStep1(localFileUri, mimeType);
                return;
            default:
                // TODO other types of files?
                Log.w("CoolMazeLogStart", "Intent type is " + intent.getType());
                return;
        }
    }

    //
    // Activity will be destroyed and recreated each time the user rotates the screen.
    // Also, when the needs to free some memory.
    // Restoring state is not 100% automatic, we need to override onSaveInstanceState()
    // and onRestoreInstanceState() for member values.

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

    @Override
    void sendPending() {
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
        RequestParams params = new RequestParams(
                "qrKey", qrKeyToSignal,
                "message", messageToSignal,
                "gcsObjectName", gcsObjectName,
                "hash", resourceHash,
                "filename", resourceFilename
        );
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
                        try {
                            if( new String(errorResponse, "UTF-8").contains("qrKey must be valid")) {
                                showError("Please open webpage coolmaze.net on your computer and scan its QR-code.");
                                return;
                            }
                        } catch (UnsupportedEncodingException e1) {
                            // Whatever
                        }
                        showError("Unfortunately, we could not send this message to the dispatch server.");
                    }
                });

        // Show some feedback on the screen
        setContentView(R.layout.activity_main);
        showSpinning();
        showCaption("Sending to target...");
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
            String thumbnailData = Thumbnails.generate(inputStream, localFileUri, mimeType);
            if(thumbnailData != null)
                synchronized (workflowLock) {
                    thumbnailDataURI = thumbnailData;
                }
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
        try {
            BufferedInputStream bis = new BufferedInputStream(getContentResolver().openInputStream(localFileUri));
            resourceHash = Util.hash(bis);
        } catch (FileNotFoundException e) {
            showError("Unexpected: file not found!");
        }

        // Issue #105. May be null.
        resourceFilename = Util.extractFileNameWithExtension(getContentResolver(), localFileUri);

        newAsyncHttpClient().post(
                BACKEND_URL + "/new-gcs-urls",
                new RequestParams(
                        "type", mimeType,
                        "filesize", resourceSize,
                        "hash", resourceHash,
                        "filename", resourceFilename
                ),
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

        Header[] putRequestHeaders = new Header[]{
                new BasicHeader("Content-Type", mimeType)
        };
        if( resourceFilename!= null && !"".equals(resourceFilename) ) {
            try {
                String encodedFilename = URLEncoder.encode(resourceFilename, "UTF-8");
                putRequestHeaders = new Header[]{
                        new BasicHeader("Content-Type", mimeType),
                        new BasicHeader("Content-Disposition", "filename=\"" + encodedFilename + "\""),
                };
            } catch (UnsupportedEncodingException e) {
                Log.e("CoolMazeLogUpload", "Could not encode filename " + resourceFilename);
            }
        }

        Log.i("CoolMazeLogEvent", "Uploading resource " + resourcePutUrl.split("\\?")[0] );
        newAsyncHttpClient().put(
                context,
                resourcePutUrl,
                putRequestHeaders,
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

}

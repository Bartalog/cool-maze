package net.coolmaze.coolmaze;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Vibrator;
import android.util.Log;

import com.google.zxing.integration.android.IntentIntegrator;
import com.loopj.android.http.AsyncHttpResponseHandler;
import com.loopj.android.http.JsonHttpResponseHandler;
import com.loopj.android.http.RequestParams;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.List;

import cz.msebera.android.httpclient.Header;
import cz.msebera.android.httpclient.entity.InputStreamEntity;
import cz.msebera.android.httpclient.entity.StringEntity;
import cz.msebera.android.httpclient.message.BasicHeader;

/**
 * Handles ACTION_SEND_MULTIPLE.
 * See issue #83.
 */
public class MultipleFileActivity extends MainActivity {

    // TODO 1 request to /scanned, per thumbnail to send
    protected List<PreUpload> preUploads = new ArrayList<>();

    protected int unfinishedUploads;

    static class PreUploadRequest {
        String ContentType;
        long Size;
        String Hash;
        String Filename;
    }

    static class PreUploadResponse {
        boolean Existing;
        String UrlPut;
        String UrlGet;
        String GcsObjectName;
    }

    static class PreUpload {
        int multiIndex;
        Uri localResourceUri;
        String thumbnailDataUri;

        PreUploadRequest req = new PreUploadRequest();
        PreUploadResponse resp = new PreUploadResponse();

        public PreUpload(int multiIndex) {
            this.multiIndex = multiIndex;
        }
    }

    void scanAndSend(Intent intent) {
        if ( !Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()) ) {
            showError("Intent action is " + intent.getAction() + " instead of ACTION_SEND_MULTIPLE");
            return;
        }

        String type = intent.getType();
        String[] typeParts = type.split("/");
        String typeCat = typeParts[0];
        switch (typeCat) {
            case "text":
                // Short texts, URLs, etc. are sent directly to the broker
                // (no need to upload a file)

                // TODO: who the hell shares multiple URLs at once ...?
                showError("Multiple text share: Not implemented yet");
                return;
            case "image":
            case "video":
            case "audio":
            case "application":
                // 1) We request pairs of upload/download URLs from the backend
                // 2) We upload the files
                // 3) We send the download URLs to the broker
                preUploads = new ArrayList<>(8);
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN) {
                    ClipData clip = intent.getClipData();
                    if ( clip.getItemCount() == 0 ) {
                        Log.e("CoolMazeLogSignal", "ClipData having 0 item :(");
                        showError("Couldn't find the resource to be shared.");
                        return;
                    }
                    for(int i=0; i<clip.getItemCount(); i++) {
                        ClipData.Item item = clip.getItemAt(i);
                        PreUpload preUpload = new PreUpload(i);
                        preUpload.localResourceUri = item.getUri();
                        preUploads.add(preUpload);
                    }
                }else{
                    Log.e("CoolMazeLogSignal", "Intent.getClipData() needs at least JELLY_BEAN :(");
                    showError("Multiple share via Cool Maze requires at least Android 4.1 (Jelly Bean)");
                    return;
                }
                Log.i("CoolMazeLogStart", "Initiating upload of " + preUploads + " ...");
                setContentView(R.layout.activity_main);
                showSpinning();
                showCaption("Uploading...");

                finishedScanning = false;
                finishedUploading = false;
                multipleUploadStep1();
                return;
            default:
                // TODO other types of files?
                Log.w("CoolMazeLogStart", "Intent type is " + intent.getType());
                return;
        }
    }

    void multipleUploadStep1() {

        // Create JSON request objects
        // And generate thumbnails
        JSONArray jsonList = new JSONArray();
        for(PreUpload preUpload: preUploads) {
            Uri localFileUri = preUpload.localResourceUri;
            InputStream inputStream = null;
            try {
                preUpload.req.ContentType = extractMimeType(null, localFileUri);
                inputStream = getContentResolver().openInputStream(localFileUri);
                preUpload.req.Size = inputStream.available();

                JSONObject item = new JSONObject();
                item.put("ContentType", preUpload.req.ContentType);
                item.put("Size", preUpload.req.Size);
                // TODO item.put("Hash", );
                // TODO item.put("Filename", );
                jsonList.put(item);

                // thumbnailDataUri may be null. This means "no thumb at this position".
                preUpload.thumbnailDataUri = generateThumbnail(inputStream, localFileUri, preUpload.req.ContentType);
            } catch (IOException e) {
                Log.e("CoolMazeLogMultiThumb", "IO :( " + e);
            } catch (JSONException e) {
                Log.e("CoolMazeLogMultiThumb", ""+e);
            } finally {
                if (inputStream != null)
                    try {
                        inputStream.close();
                    } catch (IOException e) {
                    }
            }
        }

        // TODO check resources hash (see issue #105)

        StringEntity payload = null;
        try {
            payload = new StringEntity(jsonList.toString());
        } catch (UnsupportedEncodingException e) {
            Log.e("JSON entity encoding :(", ""+e);
        }

        newAsyncHttpClient().post(
                this,
                BACKEND_URL + "/new-multiple-gcs-urls",
                payload,
                "application/json",
                new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject response) {
                        Log.i("CoolMazeLogMultiUpload", "Multiple signed URLs request success :) \n ");
                        // Log.i("CoolMazeLogMultiUpload", "response payload = " + response);
                        try {
                            JSONArray items = response.getJSONArray("uploads");
                            for (int i = 0; i < items.length(); i++) {
                                JSONObject jsonItem = items.getJSONObject(i);
                                PreUpload preUpload = preUploads.get(i);
                                preUpload.resp.Existing = jsonItem.getBoolean("Existing");
                                if (preUpload.resp.Existing) {
                                    // Yeepee, we don't have to upload this one
                                    Log.i("CoolMazeLogMultiUpload", "This resource is already known in server cache :)");
                                }else {
                                    preUpload.resp.UrlPut = jsonItem.getString("UrlPut");
                                }

                                preUpload.resp.UrlGet = jsonItem.getString("UrlGet");
                                preUpload.resp.GcsObjectName = jsonItem.optString("GcsObjectName");
                            }
                            multiUploadStep2();
                        } catch (JSONException e) {
                            Log.e("CoolMazeLogMultiUpload", "JSON signed URLs extract failed :( from " + response);
                        }
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, Throwable throwable, JSONObject errorResponse) {
                        // Issue #112: Unfortunately, user won't see the error message box until she has finished scanning :(
                        Log.e("CoolMazeLogMultiUpload", "Failure :( " + errorResponse);

                        if(statusCode==412){
                            // PRECONDITION_FAILED
                            try {
                                String message = errorResponse.getString("message");
                                showError(message);
                            } catch (JSONException e) {
                                Log.e("CoolMazeLogMultiUpload", "JSON :(", e);
                            }
                            return;
                        }

                        showError("Unfortunately, we could not obtain secure upload URLs.");
                    }
                });

       //         UPLOAD

        // This begins *while all the uploads are still working*
        new IntentIntegrator(MultipleFileActivity.this)
                .addExtra("PROMPT_MESSAGE", SCAN_INVITE)
                .initiateScan();
    }

    void multiUploadStep2() {
        synchronized (workflowLock) {
            unfinishedUploads = preUploads.size();
        }

        for(final PreUpload preUpload: preUploads) {
            File localFile = new File(preUpload.localResourceUri.getPath());
            InputStream inputStream;
            try {
                inputStream = getContentResolver().openInputStream(preUpload.localResourceUri);
            } catch (FileNotFoundException e) {
                Log.e("CoolMazeLogMultiUpload", "Not found :( " + e);
                return;
            }

            InputStreamEntity entity = new InputStreamEntity(inputStream);
            Context context = null; // ?

            Log.i("CoolMazeLogEvent", "Uploading resource " + preUpload.resp.UrlPut.split("\\?")[0]);
            newAsyncHttpClient().put(
                    context,
                    preUpload.resp.UrlPut,
                    entity,
                    preUpload.req.ContentType,
                    new AsyncHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                            Log.i("CoolMazeLogSignal", "Upload resource " + preUpload.multiIndex + " success :)");

                            dispatchOne(qrKeyToSignal, preUpload);

                            boolean done = false;
                            synchronized (workflowLock) {
                                unfinishedUploads --;
                                if (unfinishedUploads == 0 && finishedScanning)
                                    done = true;
                            }
                            if (done)
                                displayFinished();
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                            String errorResponseStr = errorResponse == null ? "[]" : "[" + new String(errorResponse) + "]";
                            Log.e("CoolMazeLogSignal", "Upload resource failed :( with status " + statusCode + " " + errorResponseStr, e);
                            showError("Unfortunately, the upload failed.");
                        }
                    });
        }
    }

    void dispatchOne(String qrKey, PreUpload preUpload){
        RequestParams params = new RequestParams(
                "qrKey", qrKey,
                "multiIndex", preUpload.multiIndex,
                "multiCount", preUploads.size(),
                "message", preUpload.resp.UrlGet,
                "gcsObjectName", preUpload.resp.GcsObjectName,
                "hash", preUpload.req.Hash
        );

        newAsyncHttpClient().post(
                BACKEND_URL + "/dispatch",
                params,
                new AsyncHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                        Log.i("CoolMazeLogMulti", MultipleFileActivity.this.hashCode() + ".dispatchOne successful POST");
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                        Log.e("CoolMazeLogMulti", MultipleFileActivity.this.hashCode() + ".sendMessage POST request response code " + statusCode);
                        showError("Unfortunately, we could not send this message to the dispatch server.");
                    }
                });
    }

    void displayFinished() {
        Log.i("CoolMazeLogMulti", "displayFinished()");
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        v.vibrate(500);
        showSuccess();
        closeCountdown(4);
    }

    // TODO onRestoreInstanceState
    // TODO onSaveInstanceState
}

package net.coolmaze.coolmaze;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import com.google.zxing.integration.android.IntentIntegrator;
import com.loopj.android.http.AsyncHttpResponseHandler;
import com.loopj.android.http.JsonHttpResponseHandler;
import com.loopj.android.http.RequestParams;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
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

/**
 * Handles ACTION_SEND_MULTIPLE.
 * See issue #83.
 *
 * Base behavior is inherited from MainActivity, and some important methods are overridden.
 */
public class MultipleFileActivity extends BaseActivity {

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
        static enum Status {
            NEW,
            READY_TO_SEND_THUMB,
            READY_TO_UPLOAD,
            UPLOADING,
            READY_TO_DISPATCH,
            DISPATCHING,
            DISPATCHED;
        }

        Status status = Status.NEW;
        int multiIndex;
        Uri localResourceUri;
        String thumbnailDataUri;

        PreUploadRequest req = new PreUploadRequest();
        PreUploadResponse resp = new PreUploadResponse();

        public PreUpload(int multiIndex) {
            this.multiIndex = multiIndex;
        }
    }

    @Override
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
                    showError("Multiple share via Cool Maze requires at least Android 4.1 (Jelly Bean)");
                    return;
                }
                Log.i("CoolMazeLogStart", "Initiating upload of " + preUploads + " ...");
                setContentView(R.layout.activity_main);
                showSpinning();
                showCaption("Uploading...");

                finishedScanning = false;
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
            BufferedInputStream inputStream = null;
            try {
                preUpload.req.ContentType = Util.extractMimeType(getContentResolver(), null, localFileUri);
                inputStream = new BufferedInputStream(getContentResolver().openInputStream(localFileUri));
                inputStream.mark(Integer.MAX_VALUE);
                preUpload.req.Size = inputStream.available();

                // See issue #32: server file hash-based cache.
                // TODO  (null to be fixed)
                //preUpload.req.Hash = Util.hash(inputStream);
                //inputStream.reset();

                // Issue #105. May be null.
                preUpload.req.Filename = Util.extractFileName(getContentResolver(), localFileUri);

                JSONObject item = new JSONObject();
                item.put("ContentType", preUpload.req.ContentType);
                item.put("Size", preUpload.req.Size);
                item.put("Hash", preUpload.req.Hash);
                item.put("Filename", preUpload.req.Filename);
                jsonList.put(item);

                // thumbnailDataUri may be null. This means "no thumb at this position".
                preUpload.thumbnailDataUri = Thumbnails.generate(inputStream, localFileUri, preUpload.req.ContentType);
                if(preUpload.thumbnailDataUri != null)
                    preUpload.status = PreUpload.Status.READY_TO_SEND_THUMB;
            } catch (IOException e) {
                Log.e("CoolMazeLogMultiThumb", "IO :( " + e.getMessage());
            } catch (JSONException e) {
                Log.e("CoolMazeLogMultiThumb", e.getMessage());
            } finally {
                if (inputStream != null)
                    try {
                        inputStream.close();
                    } catch (IOException e) {
                    }
            }
        }

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
                                    preUpload.status = PreUpload.Status.READY_TO_DISPATCH;
                                }else {
                                    preUpload.resp.UrlPut = jsonItem.getString("UrlPut");
                                    preUpload.status = PreUpload.Status.READY_TO_UPLOAD;
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

            if(preUpload.status == PreUpload.Status.READY_TO_DISPATCH) {
                Log.i("CoolMazeLogSignal", "Dispatching already existing resource " + preUpload.multiIndex);

                boolean allDone = false;
                boolean dispatchOneNow = false;
                synchronized (workflowLock) {
                    unfinishedUploads --;
                    if(finishedScanning) {
                        dispatchOneNow = true;
                        if (unfinishedUploads == 0)
                            allDone = true;
                    }
                }
                if(dispatchOneNow)
                    dispatchOne(preUpload);
                if (allDone)
                    displayFinished();
                continue;
            }

            Log.i("CoolMazeLogEvent", "Uploading resource " + preUpload.resp.UrlPut.split("\\?")[0]);
            preUpload.status = PreUpload.Status.UPLOADING;
            newAsyncHttpClient().put(
                    context,
                    preUpload.resp.UrlPut,
                    entity,
                    preUpload.req.ContentType,
                    new AsyncHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                            Log.i("CoolMazeLogSignal", "Upload resource " + preUpload.multiIndex + " success :)");
                            preUpload.status = PreUpload.Status.READY_TO_DISPATCH;

                            boolean allDone = false;
                            boolean dispatchOneNow = false;
                            synchronized (workflowLock) {
                                unfinishedUploads --;
                                if(finishedScanning) {
                                    dispatchOneNow = true;
                                    if (unfinishedUploads == 0)
                                        allDone = true;
                                }
                            }
                            if(dispatchOneNow)
                                dispatchOne(preUpload);
                            if (allDone)
                                displayFinished();
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                            String errorResponseStr = errorResponse == null ? "[]" : "[" + new String(errorResponse) + "]";
                            Log.e("CoolMazeLogSignal", "Upload resource failed :( with status " + statusCode + " " + errorResponseStr, e);
                            showError("Unfortunately, upload of resource " + preUpload.multiIndex + " failed.");
                        }
                    });
        }
    }

    void dispatchOne(final PreUpload preUpload){
        Log.i("CoolMazeLogSignal", "Dispatching resource " + preUpload.multiIndex);
        preUpload.status = PreUpload.Status.DISPATCHING;

        RequestParams params = new RequestParams(
                "qrKey", qrKeyToSignal,
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
                        preUpload.status = PreUpload.Status.DISPATCHED;
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                        Log.e("CoolMazeLogMulti", MultipleFileActivity.this.hashCode() + ".sendMessage POST request response code " + statusCode);
                        showError("Unfortunately, we could not send message " + preUpload.multiIndex + " to the dispatch server.");
                    }
                });
    }


    @Override
    void sendPending() {
        boolean displayFinishedNow;
        synchronized (workflowLock) {
            finishedScanning = true;
            displayFinishedNow = (unfinishedUploads==0);
        }
        for(PreUpload preUpload:preUploads)
            synchronized (preUpload){
                switch(preUpload.status){
                    case READY_TO_SEND_THUMB:
                    case READY_TO_UPLOAD:
                    case UPLOADING:
                        notifyScan(preUpload);
                        break;
                    case READY_TO_DISPATCH:
                    preUpload.status = PreUpload.Status.DISPATCHING;
                    dispatchOne(preUpload);
                        break;
                }
            }

        if(displayFinishedNow)
            displayFinished();
    }

    void notifyScan(PreUpload preUpload) {
        RequestParams params = new RequestParams(
                "qrKey", qrKeyToSignal,
                "multiIndex", preUpload.multiIndex,
                "multiCount", preUploads.size()
        );

        if (preUpload.thumbnailDataUri != null && !"<?>".equals(preUpload.thumbnailDataUri)) {
            params.add("thumb", preUpload.thumbnailDataUri);
            Log.i("CoolMazeLogEvent", "Sending scan notif " + preUpload.multiIndex + " to " + qrKeyToSignal + " with thumbnail of size " + preUpload.thumbnailDataUri.length());
        } else
            Log.i("CoolMazeLogEvent", "Sending scan notif " + preUpload.multiIndex + " to " + qrKeyToSignal);

        newAsyncHttpClient().post(
                BACKEND_URL + "/scanned",
                params,
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

    // TODO onActivityResult?
    // TODO onResume ?
    // TODO onRestoreInstanceState ?
    // TODO onSaveInstanceState ?
}

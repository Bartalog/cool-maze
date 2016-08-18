package net.coolmaze.coolmaze;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Handler;
import android.os.Looper;
import android.os.Vibrator;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.View;
import android.webkit.MimeTypeMap;
import android.widget.ImageView;
import android.widget.ProgressBar;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import javax.net.ssl.HttpsURLConnection;
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

    static final String SCAN_INVITE = "Open " + FRONTPAGE_DOMAIN + " on target computer and scan it!";
    static final AsyncHttpResponseHandler blackhole = new BlackholeHttpResponseHandler();

    private String messageToSignal = "<?>";
    private String chanIDToSignal = "<?>";

    @Override
    protected void onResume() {
        super.onResume();

        // Get intent, action and MIME type
        Intent intent = getIntent();
        Log.i("CoolMazeSignal", "onResume(): Intent="+intent);
        if ( intent == null )
            return;

        if ( !Intent.ACTION_SEND.equals(intent.getAction()) )
            return;  // MAIN, etc.

        wakeupBackend();

        scanAndSend(intent);
        // "consume the intent" so it won't be processed again
        setIntent(null);
    }

    protected void scanAndSend(Intent intent) {
        String type = intent.getType();
        String[] typeParts = type.split("/");
        String typeCat = typeParts[0];
        switch (typeCat) {
            case "text":
                messageToSignal = intent.getStringExtra(Intent.EXTRA_TEXT);
                new IntentIntegrator(MainActivity.this)
                        //.setOrientationLocked(false)
                        .addExtra("PROMPT_MESSAGE", SCAN_INVITE)
                        .initiateScan();
                return;
            case "image":
            case "video":
            case "application":
                Uri localFileUri = intent.getData();
                if ( localFileUri == null ) {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN) {
                        ClipData clip = intent.getClipData();
                        if ( clip.getItemCount() == 0 ) {
                            Log.e("CoolMazeSignal", "ClipData having 0 item :(");
                            return;
                    }
                        ClipData.Item item = clip.getItemAt(0);
                        localFileUri = item.getUri();
                    }else{
                        Log.e("CoolMazeSignal", "Intent.getClipData() needs at least JELLY_BEAN :(");
                        return;
                    }
                }
                Log.w("CoolMazeSignal", "Initiating upload of " + localFileUri + " ...");
                setContentView(R.layout.activity_main);
                showSpinning();
                showCaption("Uploading...");

                String mimeType = extractMimeType(intent, localFileUri);
                gentleUploadStep1(localFileUri, mimeType);
                return;
            default:
                // TODO other types of files?
                Log.w("CoolMazeSignal", "Intent type is " + intent.getType());
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

    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        Log.i("CoolMazeSignal", "onActivityResult(" + requestCode + ", " + resultCode + ", " + data + ")");

        if (resultCode == RESULT_CANCELED) {
            // User was on the Scan screen, but hit her Back button or similar
            Log.i("CoolMazeSignal", "Scan was canceled by user");
            finish();
            return;
        }

        IntentResult scanResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scanResult == null) {
            Log.e("CoolMazeSignal", "IntentResult parsing by ZXing failed :(");
            return;
        }

        Log.i("CoolMazeSignal", "IntentResult successfully parsed by ZXing");
        chanIDToSignal = scanResult.getContents();

        // This short vibration means "Hey cool, you've just scanned something!"
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        v.vibrate(100);

        Log.i("CoolMazeSignal", "Sending to " + chanIDToSignal + " message [" + messageToSignal + "]");
        if ( "<?>".equals(messageToSignal) ){
            showError("Unfortunately, we're experiencing bug #55. The message was not sent to the dispatch server.");
            return;
        }
        RequestParams params = new RequestParams("chanID", chanIDToSignal, "message", messageToSignal);
        // conn.setReadTimeout(15000);
        // conn.setConnectTimeout(15000);
        new AsyncHttpClient().post(
                BACKEND_URL + "/dispatch",
                params,
                new AsyncHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                        Log.i("CoolMazeSignal", "sendMessage successful POST");
                        // This long vibration should mean "The target has received your message!",
                        // ...but it doesn't, yet.
                        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                        v.vibrate(500);
                        showSuccess();
                        closeCountdown(2);
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                        Log.e("CoolMazeSignal", "sendMessage POST request response code " + statusCode);
                        showError("Unfortunately, we could not send this message to the dispatch server.");
                    }
                });

        // Show some feedback on the screen
        setContentView(R.layout.activity_main);
        showSpinning();
        showCaption("Sending to target...");
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

    private void gentleUploadStep1(final Uri localFileUri, final String mimeType) {
        new AsyncHttpClient().post(
                BACKEND_URL + "/new-gcs-urls",
                new RequestParams("type", mimeType),
                new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject response) {
                        Log.i("CoolMazeSignal", "Signed URLs request success :) \n ");
                        try {
                            String urlPut = response.getString("urlPut");
                            String urlGet = response.getString("urlGet");
                            gentleUploadStep2(urlPut, urlGet, localFileUri, mimeType);
                        } catch (JSONException e) {
                            Log.e("CoolMazeSignal", "JSON signed URLs extract failed :( from " + response);
                        }
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, Throwable throwable, JSONObject errorResponse) {
                        Log.e("CoolMazeSignal", "Signed URLs request failed :( " + errorResponse);
                        showError("Unfortunately, we could not obtain secure upload URLs.");
                    }
                });

    }

    private void gentleUploadStep2(String resourcePutUrl, final String resourceGetUrl, Uri localFileUri, final String mimeType) {
        File localFile = new File(localFileUri.getPath());
        // FileEntity entity = new FileEntity(localFile);
        // Resource URIs like "content://..." don't work well as Files, better as InputStreams
        InputStream inputStream;
        try {
            inputStream = getContentResolver().openInputStream(localFileUri);
        } catch (FileNotFoundException e) {
            Log.e("CoolMazeSignal", "Not found :( " + e);
            return;
        }
        InputStreamEntity entity = new InputStreamEntity(inputStream);
        Context context = null; // ?

        Log.i("CoolMazeSignal", "Uploading resource " + resourcePutUrl.split("\\?")[0] );
        new AsyncHttpClient().put(
                context,
                resourcePutUrl,
                new Header[]{ new BasicHeader("Content-Type", mimeType) },
                entity,
                mimeType,
                new AsyncHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                        Log.i("CoolMazeSignal", "Upload resource success :)");

                        // When the target desktop receives the URL, it immediately follows it
                        messageToSignal = resourceGetUrl;
                        new IntentIntegrator(MainActivity.this)
                                //.setOrientationLocked(false)
                                .addExtra("PROMPT_MESSAGE", SCAN_INVITE)
                                .initiateScan();
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                        Log.e("CoolMazeSignal", "Upload resource failed :( " + e + " " + new String(errorResponse));
                        showError("Unfortunately, the upload failed.");
                    }
                });
    }

    private void wakeupBackend() {
        // Send a kind of custom warmup request to the backend.
        // Make it async and ignore the response.
        new AsyncHttpClient().get(BACKEND_URL + "/wakeup", blackhole);
    }

    void showError(String message){
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
}

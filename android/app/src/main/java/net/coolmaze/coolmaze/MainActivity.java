package net.coolmaze.coolmaze;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Handler;
import android.os.Looper;
import android.os.Vibrator;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.View;
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
import cz.msebera.android.httpclient.entity.FileEntity;
import cz.msebera.android.httpclient.entity.InputStreamEntity;
import cz.msebera.android.httpclient.message.BasicHeader;

public class MainActivity extends AppCompatActivity {

    static final String backendURL = "https://cool-maze.appspot.com";

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
                new IntentIntegrator(MainActivity.this).initiateScan();
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
                gentleUploadStep1(localFileUri, type);
                return;
            default:
                // TODO other types of files?
                Log.w("CoolMazeSignal", "Intent type isZZ " + intent.getType());
                return;
        }
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

        new Signaller().execute();

        // Show some feedback on the screen
        setContentView(R.layout.activity_main);
        showSpinning();
    }


    public class Signaller extends AsyncTask<Void, Void, Void> {

        @Override
        protected Void doInBackground(Void... params) {
            sendMessage(chanIDToSignal, messageToSignal);
            return null;
        }

        void sendMessage(String chanID, String message){
            Log.i("CoolMazeSignal", "Sending to " + chanID + " message [" + message + "]");

            try {
                URL url = new URL(backendURL + "/dispatch");

                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setReadTimeout(15000);
                conn.setConnectTimeout(15000);
                conn.setRequestMethod("POST");
                conn.setDoInput(true);
                conn.setDoOutput(true);


                OutputStream out = conn.getOutputStream();
                BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(out, "UTF-8"));
                writer.write("chanID="+chanID+"&message="+ URLEncoder.encode(message, "UTF-8"));

                writer.flush();
                writer.close();
                out.close();

                int responseCode=conn.getResponseCode();
                if (responseCode != HttpsURLConnection.HTTP_OK) {
                    Log.e("CoolMazeSignal", "POST request response code " + responseCode);
                    return;
                }

                Log.i("CoolMazeSignal", "Successful POST");
                // This long vibration should mean "The target has received your message!",
                // ...but it doesn't, yet.
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                v.vibrate(500);
                showSuccess();
                closeCountdown(2);
            } catch (Exception e) {
                Log.e("CoolMazeSignal", "POST request", e);
            }
        }
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

    void closeCountdown(int seconds) {
        Handler handler = new Handler(Looper.getMainLooper());
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                finish();
            }
        }, 1000 * seconds);
    }

    private void gentleUploadStep1(final Uri localFileUri, final String type) {
        String signedUrlsCreationUrl = backendURL + "/new-gcs-urls";
        AsyncHttpClient client = new AsyncHttpClient();
        RequestParams params = new RequestParams();
        params.put("type", type);
        client.post(signedUrlsCreationUrl, params, new AsyncHttpResponseHandler() {
            @Override
            public void onStart() {
            }

            @Override
            public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                Log.i("CoolMazeSignal", "Signed URLs request success :) \n ");
                String jsonStr = new String(response);
                try {
                    JSONObject json = new JSONObject(jsonStr);
                    String urlPut = json.getString("urlPut");
                    String urlGet = json.getString("urlGet");
                    gentleUploadStep2(urlPut, urlGet, localFileUri, type);
                } catch (JSONException e) {
                    Log.e("CoolMazeSignal", "JSON signed URLs extract failed :( from " + jsonStr);
                }
            }

            @Override
            public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                Log.e("CoolMazeSignal", "Signed URLs request failed :( " + e);
            }

            @Override
            public void onRetry(int retryNo) {
                // called when request is retried
            }
        });

    }

    private void gentleUploadStep2(String resourcePutUrl, final String resourceGetUrl, Uri localFileUri, final String type) {
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
        String contentType = type;
        Context context = null; // ?

        Log.i("CoolMazeSignal", "Uploading resource " + resourcePutUrl.split("\\?")[0] );
        AsyncHttpClient client = new AsyncHttpClient();
        Header[] headers = new Header[1];
        headers[0] = new BasicHeader("Content-Type", type);
        client.put(context, resourcePutUrl, headers, entity, contentType, new AsyncHttpResponseHandler() {
            @Override
            public void onStart() {
            }

            @Override
            public void onSuccess(int statusCode, Header[] headers, byte[] response) {
                Log.i("CoolMazeSignal", "Upload resource success :)");

                // When the target desktop receives the URL, it immediately follows it
                messageToSignal = resourceGetUrl;
                new IntentIntegrator(MainActivity.this).initiateScan();
            }

            @Override
            public void onFailure(int statusCode, Header[] headers, byte[] errorResponse, Throwable e) {
                Log.e("CoolMazeSignal", "Upload resource failed :( " + e + " " + new String(errorResponse));
            }

            @Override
            public void onRetry(int retryNo) {
                // called when request is retried
            }
        });
    }
}

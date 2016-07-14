package net.coolmaze.coolmaze;

import android.content.Context;
import android.content.Intent;
import android.os.AsyncTask;
import android.os.Vibrator;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.View;
import android.widget.ImageView;
import android.widget.ProgressBar;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import java.io.BufferedWriter;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

import javax.net.ssl.HttpsURLConnection;

public class MainActivity extends AppCompatActivity {

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
        switch (intent.getType()) {
            case "text/plain":
                messageToSignal = intent.getStringExtra(Intent.EXTRA_TEXT);
                break;
            // TODO other types of "share with": files, etc.
            default:
                return;
        }
        new IntentIntegrator(MainActivity.this).initiateScan();
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
            String backendURL = "http://cool-maze.appspot.com";
            String service = "/dispatch";

            try {
                URL url = new URL(backendURL + service);

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
}

package net.coolmaze.coolmaze;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.os.Environment;
import android.os.Vibrator;
import android.provider.MediaStore.Files.FileColumns;
import android.support.design.widget.FloatingActionButton;
import android.support.design.widget.Snackbar;
import android.support.v4.content.ContextCompat;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.View;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.EditText;
import android.widget.TextView;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import java.io.BufferedWriter;
import java.io.File;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;

import javax.net.ssl.HttpsURLConnection;

public class MainActivity extends AppCompatActivity {

    private String messageToSignal = "<?>";
    private String chanIDToSignal = "<?>";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        scanAndSend();
    }

    @Override
    protected void onResume() {
        super.onResume();
        scanAndSend();
    }

    protected void scanAndSend() {
        setContentView(R.layout.activity_main);
        Toolbar toolbar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

       FloatingActionButton fab = (FloatingActionButton) findViewById(R.id.fab);
        fab.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Snackbar.make(view, "Replace with your own action", Snackbar.LENGTH_LONG)
                        .setAction("Action", null).show();

                EditText chanID_text = (EditText) findViewById(R.id.editChanID);
                chanIDToSignal = chanID_text.getText().toString();

                new IntentIntegrator(MainActivity.this).initiateScan();
            }
        });


        // Get intent, action and MIME type
        Intent intent = getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                messageToSignal = intent.getStringExtra(Intent.EXTRA_TEXT);
            }
            // TODO other types of "share with": files, etc.
        }

        new IntentIntegrator(MainActivity.this).initiateScan();
    }

    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        Log.i("CoolMazeSignal", "onActivityResult(" + requestCode + ", " + resultCode
                + ", " + data + ")");

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

        EditText chanID_text = (EditText) findViewById(R.id.editChanID);
        chanID_text.setText(chanIDToSignal, TextView.BufferType.EDITABLE);

        new Signaller().execute();
    }



    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        // Inflate the menu; this adds items to the action bar if it is present.
        getMenuInflater().inflate(R.menu.menu_main, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        // Handle action bar item clicks here. The action bar will
        // automatically handle clicks on the Home/Up button, so long
        // as you specify a parent activity in AndroidManifest.xml.
        int id = item.getItemId();

        //noinspection SimplifiableIfStatement
        if (id == R.id.action_settings) {
            return true;
        }

        return super.onOptionsItemSelected(item);
    }

    public class Signaller extends AsyncTask<Void, Void, Void> {

        @Override
        protected Void doInBackground(Void... params) {
            sendMessage(chanIDToSignal, messageToSignal);
            return null;
        }

        void sendMessage(String chanID, String message){
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
            } catch (Exception e) {
                Log.e("CoolMazeSignal", "POST request", e);
            }
        }
    }

}

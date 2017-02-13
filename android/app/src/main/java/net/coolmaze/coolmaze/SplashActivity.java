package net.coolmaze.coolmaze;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.widget.Button;
import android.view.View;

public class SplashActivity extends AppCompatActivity {

    final String samplePhotoURL = "https://storage.googleapis.com/cool-maze.appspot.com/sample.jpg";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);
        Toolbar toolbar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

        Button button_sample = (Button) findViewById(R.id.button_sample);
        button_sample.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                launchSampleSend();
            }
        });

        //closeCountdown(4);
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

    void launchSampleSend(){
        new AlertDialog.Builder(this)
                .setMessage("Please choose to share via \"Cool Maze\"\n"
                    +"\n"
                    +"The app will use camera to scan QR-code.")
                .setIcon(android.R.drawable.ic_dialog_info)
                .setPositiveButton("Got it", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int id) {

                        Intent intent = new Intent();
                        //Intent intent = new Intent(this, MainActivity.class);
                        intent.setAction(Intent.ACTION_SEND);
                        intent.setType("text/plain");
                        intent.putExtra(Intent.EXTRA_TEXT, samplePhotoURL);

                        startActivity(Intent.createChooser(intent, "Share via"));
                    }
                })
                .show();
    }
}

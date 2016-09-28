package net.coolmaze.coolmaze;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.ThumbnailUtils;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;

import com.loopj.android.http.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Created by valentin on 28/09/16.
 */
public class Thumbnails {

    static String generate(InputStream inputStream, Uri localFileUri, String mimeType) {
        if ( !Util.thumbnailable(mimeType) ) {
            Log.i("CoolMazeLogThumb", "No thumbnail generation for resource type " + mimeType);
            return null;
        }

        long tip = System.currentTimeMillis();
        Bitmap thumbBitmap;

        if(mimeType.startsWith("image/"))
            thumbBitmap = ThumbnailUtils.extractThumbnail(BitmapFactory.decodeStream(inputStream), 256, 192);
        else if(mimeType.startsWith("video/")) {
            // MINI_KIND is 512x384
            Bitmap videoThumbBitmap = ThumbnailUtils.createVideoThumbnail(localFileUri.getPath(), MediaStore.Images.Thumbnails.MINI_KIND);
            if(videoThumbBitmap==null) {
                Log.e("CoolMazeLogThumb", "Cannot generate thumbnail for this video.");
                return null;
            }
            if(videoThumbBitmap.getHeight() > videoThumbBitmap.getWidth())
                // Portrait
                thumbBitmap = Bitmap.createScaledBitmap(videoThumbBitmap, 192, 256, true);
            else
                // Landscape
                thumbBitmap = Bitmap.createScaledBitmap(videoThumbBitmap, 256, 192, true);
        } else {
            Log.e("CoolMazeLogThumb", "Unsupported resource type " + mimeType);
            return null;
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
        return data;
    }

}

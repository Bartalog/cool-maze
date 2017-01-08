package net.coolmaze.coolmaze;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.MimeTypeMap;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;

public class Util {

    static boolean isValidQrKey(String s) {
        // A valid qrKey is a string encoded in a QR-code on page coolmaze.net .
        // Since #108 a valid qrKey is string of exactly 11 characters
        // from 62-char-set [0-9a-zA-Z].
        return s.matches("^[0-9a-zA-Z]{11}$");

        // TODO maybe relax this check?
        // This would make format change easier, no need to update app.
    }

    static String extractMimeType(ContentResolver resolver, Intent intent, Uri localFileUri) {
        // Trying strategies that work in most cases: photos, videos, pdf, etc,
        // should work fine for "file://..." and "content://..." as well.
        String mimeType = null;
        if( intent!=null )
            mimeType = intent.getType();
        if ( mimeType==null || "".equals(mimeType) || mimeType.endsWith("/*") ){
            //String resolved = MimeTypeMap.getSingleton().getExtensionFromMimeType(getContentResolver().getType(localFileUri));
            String resolved = resolver.getType(localFileUri);
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


    static String extractFileName(ContentResolver resolver, Uri uri) {
        // From http://stackoverflow.com/a/5569478/871134
        // Note that this doesn't include the file extension.

        String scheme = uri.getScheme();
        if (scheme.equals("file"))
            return uri.getLastPathSegment();
        if (scheme.equals("content")) {
            String[] proj = { MediaStore.Images.Media.TITLE };
            Cursor cursor = resolver.query(uri, proj, null, null, null);
            if (cursor != null) {
                String filename = null;
                if (cursor.getCount() != 0) {
                    int columnIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.TITLE);
                    cursor.moveToFirst();
                    filename = cursor.getString(columnIndex);
                }
                cursor.close();
                return filename;
            }
        }
        return null;
    }

    static String extractFileNameWithExtension(ContentResolver resolver, Uri uri) {
        String filename = extractFileName(resolver, uri);
        String mime = resolver.getType(uri);
        if(mime!=null && !"".equals(mime)) {
            String fileExtension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            if(fileExtension!=null && !"".equals(fileExtension))
                return filename + "." + fileExtension;
        }
        // Not found, return without extension
        return filename;
    }

    // From http://stackoverflow.com/a/23421126/871134
    static String hash(BufferedInputStream input) {
        // This is currently a MD5 hash.
        // But any other (good and fast) hash algo would do.
        MessageDigest md = null;
        try {
            md = MessageDigest.getInstance("MD5");
            DigestInputStream dis = new DigestInputStream(input, md);
            byte[] buffer = new byte[1024];
            while(dis.read(buffer, 0, buffer.length) != -1) ;

            return toHexString(md.digest());
        } catch(Exception e) {
            Log.e("CoolMazeSignal", "Computing file hash: " + e);
        }
        return "";
    }

    // From http://stackoverflow.com/a/332101/871134
    static String toHexString(byte[] bytes) {
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

    static boolean thumbnailable(String mimeType) {
        if(mimeType==null)
            return false;
        if(mimeType.startsWith("image/"))
            return true;
        if(mimeType.startsWith("video/"))
            return true;   // see https://developer.android.com/reference/android/media/ThumbnailUtils.html#createVideoThumbnail(java.lang.String,%20int)
        // TODO: handle more types? pdf icons, etc.
        return false;
    }
}

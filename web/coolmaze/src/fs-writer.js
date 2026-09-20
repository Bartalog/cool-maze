
import { using } from './backend.js';
import { base64toBlob } from './util.js';
import { NumberFilename } from './zip.js';

async function saveToDirectory(items) {
    // Check if API is supported (redundant check but safe)
    if (!('showDirectoryPicker' in window)) {
        throw new Error("File System Access API not supported");
    }

    // 1. Let user pick a directory
    let dirHandle;
    try {
        dirHandle = await window.showDirectoryPicker();
    } catch (err) {
        if (err.name === 'AbortError') {
            console.debug("User cancelled directory picker");
            return; // Stop here, do not fallback to ZIP
        }
        throw err; // Re-throw to allow fallback if it's a real error (though unlikely for showDirectoryPicker)
    }

    // 2. Prepare unique filenames
    // We use a Set to track filenames *within this batch*.
    // Note: We don't check for existing files in the folder (overwriting might happen if user picks a folder with colliding names, 
    // but the API protects or warns usually). For improved UX we could check, but let's stick to unique names within the batch first.
    let filenamesSet = new Set();

    // We'll iterate and write files one by one.
    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        let filenameOriginal = item.resourceFilename;
        if (!filenameOriginal) {
            filenameOriginal = "shared-resource";
        }

        // Ensure uniqueness in this batch
        let filename = filenameOriginal;
        let k = 0;
        while (filenamesSet.has(filename)) {
            k++;
            filename = NumberFilename(filenameOriginal, k);
        }
        filenamesSet.add(filename);

        try {
            // 3. Get file content
            let blob;
            if (item.resourceData_b64) {
                blob = base64toBlob(item.resourceData_b64, item.resourceType);
            } else if (item.resourceUrl) {
                // Fetch the resource from URL
                const response = await fetch(item.resourceUrl);
                blob = await response.blob();
            } else {
                console.warn(`Item ${i} has no data or URL, skipping`);
                continue;
            }

            // 4. Write to file
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            console.debug(`Saved ${filename}`);

        } catch (err) {
            console.error(`Failed to save ${filename}:`, err);
            // Continue to next item? Or abort? 
            // Let's continue and try to save as many as possible.
        }
    }

    using(`download/fs/${items.length}/success`);
    //alert("Saved " + items.length + " files to " + dirHandle.name);
}

export const SaveToDirectory = saveToDirectory;

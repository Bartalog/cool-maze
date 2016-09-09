package coolmaze

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"time"

	"golang.org/x/net/context"
	"google.golang.org/appengine"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/memcache"
	"google.golang.org/cloud/storage"
)

// This is for sending a file resource.
// The resource transits on Google Cloud Storage.
// This endpoint produces 2 short-lived signed urls:
// - 1 for uploading the resource (from mobile to GCS)
// - 1 for downloading the resource (from GCS to desktop browser)

func init() {
	http.HandleFunc("/new-gcs-urls", gcsUrlsHandler)

	// This is important for randomString below
	rndOnce.Do(randomize)

	var err error
	pkey, err = ioutil.ReadFile(pemFile)
	if err != nil {
		// ..but i don't have a Context to yell at...
		// log.Errorf(c, "%v", err)
	}
}

const (
	// This GCS bucket is used for temporary storage between
	// source mobile and target desktop.
	bucket         = "cool-maze-transit"
	serviceAccount = "mobile-to-gcs@cool-maze.iam.gserviceaccount.com"
	// This (secret) file was generated by command
	//    openssl pkcs12 -in Cool-Maze-2e343b6677b7.p12 -passin pass:notasecret -out Mobile-to-GCS.pem -nodes
	pemFile = "Mobile-to-GCS.pem"
	// Cooperative limit (not attack-proof)
	MB            = 1024 * 1024
	uploadMaxSize = 21*MB - 1
	// Files exist only for a limited time on GCS
	fileGCSTTL      = 3 * time.Hour
	fileMemcacheTTL = 150 * time.Minute
)

var pkey []byte

// The /new-gcs-urls user usually advertises the following info about
// intended file to be uploaded:
// - Content type  (it becomes a part of the signed URL)
// - Size  (since #101)
// - Hash, optional (since #32)
// - TODO : Filename (#63)
func gcsUrlsHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	if r.Method != "POST" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Only POST method is accepted")
		return
	}
	// Warning: this contentType will be part of the crypted
	// signature, and the client will have to match it exactly
	contentType := r.FormValue("type")

	// Check intended filesize
	fileSizeStr := r.FormValue("filesize")
	if fileSizeStr == "" {
		log.Warningf(c, "Missing mandatory parameter: filesize")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Mandatory parameter: filesize")
		return
	}
	fileSize, err := strconv.Atoi(fileSizeStr)
	if err != nil {
		log.Warningf(c, "Invalid filesize value %q", fileSizeStr)
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Invalid parameter: filesize")
		return
	}
	if fileSize > uploadMaxSize {
		log.Warningf(c, "Can't give upload URL for resource of size %d. Max allowed size is %d.", fileSize, uploadMaxSize)
		w.WriteHeader(http.StatusPreconditionFailed)
		response := Response{
			"success": false,
			"message": fmt.Sprintf("Can't upload resource of size %dMB. Max allowed size is %dMB.", fileSize/MB, uploadMaxSize/MB),
		}
		fmt.Fprintln(w, response)
		return
	}

	// Mobile source computed hash of resource before uploading it.
	// Optional.
	// See #32
	hash := r.FormValue("hash")
	if found, urlGetExisting, gcsObjectNameExisting := findByHash(c, hash); found {
		response := Response{
			"success":  true,
			"existing": true,
			"urlGet":   urlGetExisting,
			// No "urlPut" because source won't need to upload anything.
			"gcsObjectName": gcsObjectNameExisting,
		}
		fmt.Fprintln(w, response)
		return
	}

	urlPut, urlGet, gcsObjectName, err := createUrls(c, contentType, fileSize, hash)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, `{"success": false}`)
		return
	}

	response := Response{
		"success":       true,
		"existing":      false,
		"urlPut":        urlPut,
		"urlGet":        urlGet,
		"gcsObjectName": gcsObjectName,
	}
	fmt.Fprintln(w, response)
}

func createUrls(c context.Context, contentType string, fileSize int, hash string) (urlPut, urlGet, objectName string, err error) {
	log.Infof(c, "Advertised upload content-type is %q", contentType)
	log.Infof(c, "Advertised upload size is %d", fileSize)
	log.Infof(c, "Advertised upload hash is %q", hash)

	objectName = randomGcsObjectName()
	log.Infof(c, "Creating urls for tmp object name %s", objectName)

	urlPut, err = storage.SignedURL(bucket, objectName, &storage.SignedURLOptions{
		GoogleAccessID: serviceAccount,
		PrivateKey:     pkey,
		Method:         "PUT",
		Expires:        time.Now().Add(9 * time.Minute),
		ContentType:    contentType,
	})
	if err != nil {
		return
	}

	urlGet, err = storage.SignedURL(bucket, objectName, &storage.SignedURLOptions{
		GoogleAccessID: serviceAccount,
		PrivateKey:     pkey,
		Method:         "GET",
		Expires:        time.Now().Add(10 * time.Minute),
	})

	// (Hash->ObjectName) entry not put in Memcache yet, because file is not uploaded yet.

	return
}

func findByHash(c context.Context, hash string) (found bool, urlGet string, gcsObjectName string) {
	// Look in Memcache.
	// Memcache entries are volatile, someday we may want to use Datastore too.
	cacheKey := "objectName_for_" + hash
	var cacheItem *memcache.Item
	var errMC error
	cacheItem, errMC = memcache.Get(c, cacheKey)
	if errMC == memcache.ErrCacheMiss {
		return
	}
	if errMC != nil {
		log.Warningf(c, "Problem with memcache: %v", errMC)
		return
	}
	// The value is a GCS object name
	gcsObjectName = string(cacheItem.Value)

	var errSURL error
	urlGet, errSURL = storage.SignedURL(bucket, gcsObjectName, &storage.SignedURLOptions{
		GoogleAccessID: serviceAccount,
		PrivateKey:     pkey,
		Method:         "GET",
		Expires:        time.Now().Add(10 * time.Minute),
	})
	if errSURL != nil {
		log.Errorf(c, "Creating GET url to object [%s] for known hash [%s]: %v", gcsObjectName, hash, errSURL)
		return false, "", ""
	}
	// TODO if cachedObjectName is already scheduled for deletion, then postpone the deletion.
	// Make sure #31 doesn't delete freshly re-sent files.

	found = true
	log.Infof(c, "Found existing GCE object [%s] for hash [%s]", gcsObjectName, hash)
	return
}

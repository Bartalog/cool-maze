package coolmaze

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"time"

	"cloud.google.com/go/storage"
	"golang.org/x/net/context"
	"google.golang.org/appengine"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/memcache"
)

// This is for sending a file resource.
// The resource transits on Google Cloud Storage.
// This endpoint produces 2 short-lived signed urls:
// - 1 for uploading the resource (from mobile to GCS)
// - 1 for downloading the resource (from GCS to desktop browser)

func init() {
	http.HandleFunc("/new-gcs-urls", gcsUrlsHandler)
	http.HandleFunc("/new-multiple-gcs-urls", multipleGcsUrlsHandler)

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

// Single file upload
//
// The /new-gcs-urls user advertises the following info about
// intended file to be uploaded:
// - Content type  (it becomes a part of the signed URL)
// - Size (since #101)
// - Hash, optional (since #32)
// - Filename, optional (since #63)
func gcsUrlsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	c := appengine.NewContext(r)
	var input PreUploadRequest
	if r.Method != "POST" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Only POST method is accepted")
		return
	}
	// Warning: this contentType will be part of the encrypted
	// signature, and the client will have to match it exactly
	input.ContentType = r.FormValue("type")

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
	input.Size = fileSize
	input.Filename = r.FormValue("filename")
	input.Filename = sanitizeFilename(input.Filename)

	doShort := func(response Response, urlGet string) {
		if r.FormValue("shorten") == "1" {
			shortUri, err := shorten(c, urlGet)
			if err != nil {
				log.Warningf(c, "Problem with shortUrification: %v", err)
				return
			}
			response["shortUrlGet"] = shortUri
		}
	}

	// Mobile source computed hash of resource before uploading it.
	// Optional.
	// See #32
	input.Hash = r.FormValue("hash")
	if found, urlGetExisting, gcsObjectNameExisting := findBySignature(c, input.Hash, input.Filename); found {
		response := Response{
			"success":  true,
			"existing": true,
			"urlGet":   urlGetExisting,
			// No "urlPut" because source won't need to upload anything.
			"gcsObjectName": gcsObjectNameExisting,
		}
		doShort(response, urlGetExisting)
		fmt.Fprintln(w, response)
		return
	}

	data, err := createUrls(c, input)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, `{"success": false}`)
		return
	}

	response := Response{
		"success":       true,
		"existing":      false,
		"urlPut":        data.UrlPut,
		"urlGet":        data.UrlGet,
		"gcsObjectName": data.GcsObjectName,
	}
	doShort(response, data.UrlGet)

	fmt.Fprintln(w, response)
}

func createUrls(c context.Context, in PreUploadRequest) (out PreUploadResponse, err error) {
	log.Infof(c, "Advertised upload content-type is %q", in.ContentType)
	log.Infof(c, "Advertised upload size is %d", in.Size)
	log.Infof(c, "Advertised upload hash is %q", in.Hash)
	log.Infof(c, "Advertised upload filename is %q", in.Filename)

	out.GcsObjectName = randomGcsObjectName()
	log.Infof(c, "Creating urls for tmp object name %s", out.GcsObjectName)

	out.UrlPut, err = storage.SignedURL(bucket, out.GcsObjectName, &storage.SignedURLOptions{
		GoogleAccessID: serviceAccount,
		PrivateKey:     pkey,
		Method:         "PUT",
		Expires:        time.Now().Add(9 * time.Minute),
		ContentType:    in.ContentType,
	})
	if err != nil {
		return
	}

	out.UrlGet, err = storage.SignedURL(bucket, out.GcsObjectName, &storage.SignedURLOptions{
		GoogleAccessID: serviceAccount,
		PrivateKey:     pkey,
		Method:         "GET",
		Expires:        time.Now().Add(10 * time.Minute),
	})

	// (Hash->ObjectName) entry not put in Memcache yet, because file is not uploaded yet.

	return
}

// Signature contains Hash and Filename.
//
// Filename is important because the same original file sent
// with 2 distinct names cannot use the same GCS object.
// Further optimization for far future me: in this corner case,
// copy first GCS object to a new GCS object with new Content-Disposition,
// so the file contents needn't be uploaded anew.
func findBySignature(c context.Context, hash, filename string) (found bool, urlGet string, gcsObjectName string) {
	// Look in Memcache.
	// Memcache entries are volatile, someday we may want to use Datastore too.
	signature := hash + "_" + filename
	cacheKey := "objectName_for_" + signature
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

	// #63: If hash was already encountered but filename doesn't match,
	// then the "signature" doesn't match and distinct GCS objects are created.

	found = true
	log.Infof(c, "Found existing GCE object [%s] for hash [%s] and filename [%s]", gcsObjectName, hash, filename)
	return
}

// UploadRequestParam sent by Mobile to Backend
// It says "I want to upload a file having these features"
type PreUploadRequest struct {
	ContentType string
	Size        int
	Hash        string
	Filename    string
}

// UploadResponseParam sent by Backend to Mobile
// It says "Here are your upload/download URLs"
type PreUploadResponse struct {
	Existing      bool
	UrlPut        string
	UrlGet        string
	GcsObjectName string
}

// Multiple file upload
//
// The /new-multiple-gcs-urls user advertises the following info about
// intended files to be uploaded:
// - Content type  (it becomes a part of the each signed upload URL)
// - Size
// - Hash, optional
// - Filename, optional
//
// The request payload is a JSON containing an array.
func multipleGcsUrlsHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	if r.Method != "POST" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Only POST method is accepted")
		return
	}

	decoder := json.NewDecoder(r.Body)

	var params []PreUploadRequest
	err := decoder.Decode(&params)
	if err != nil {
		log.Errorf(c, "%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, `{"success": false}`)
		return
	}

	uploads := make([]PreUploadResponse, len(params))
	for i, param := range params {
		upload := &uploads[i]

		// Known file?
		if found, urlGetExisting, gcsObjectNameExisting := findBySignature(c, param.Hash, param.Filename); found {
			upload.Existing = true
			upload.UrlGet = urlGetExisting
			upload.GcsObjectName = gcsObjectNameExisting
			continue
		}

		// Genereate short-lived URLs
		*upload, err = createUrls(c, param)
		if err != nil {
			log.Errorf(c, "%v", err)
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, `{"success": false}`)
			return
		}
	}

	response := Response{
		"success": true,
		"uploads": uploads,
	}
	fmt.Fprintln(w, response)
}

package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"io/ioutil"
	"log"
	"math/big"
	"net/http"
	"os/exec"
	"strconv"
	"strings"

	"golang.org/x/exp/shiny/driver"
	"golang.org/x/exp/shiny/screen"
	"golang.org/x/exp/shiny/widget"

	qrcode "github.com/skip2/go-qrcode"
	pusher "github.com/toorop/go-pusher"
)

//
// Note that official Go library is server library, not client library.
// See https://pusher.com/docs/libraries
//
// Using toorop's third-party lib instead.
//

const (
	// L is the qrKey length
	L = 11

	// The backend service base URL
	backend = "https://cool-maze.appspot.com"

	// Cool Maze registered Pusher app key
	coolMazePusherAppKey = "e36002cfca53e4619c15"

	// Tell the backend who is dialing
	cmdUserAgent = "Cool Maze desktop"
)

// qrKey is the string encoded in the QR-code.
// It is randomly generated at startup.
var qrKey string

func main() {
	qrKey = randSeq(L)
	pngData, err := qrcode.Encode(qrKey, qrcode.Medium, 256)
	checkerr(err)
	pngReader := bytes.NewBuffer(pngData)

	go wakeup()
	listenPusherChannels()

	driver.Main(func(s screen.Screen) {
		src, err := png.Decode(pngReader)
		// src, _, err := image.Decode(pngReader)
		checkerr(err)
		w := widget.NewSheet(widget.NewImage(src, src.Bounds()))
		err = widget.RunWindow(s, w, &widget.RunWindowOptions{
			NewWindowOptions: screen.NewWindowOptions{
				Width:  src.Bounds().Max.X,
				Height: src.Bounds().Max.Y,
			},
		})
		checkerr(err)
	})
}

func wakeup() {
	req, err := http.NewRequest("GET", backend+"/wakeup", nil)
	if err != nil {
		log.Print(err)
		// Wakeup failed, but the show might go on
		return
	}
	req.Header.Set("User-Agent", cmdUserAgent)

	q := req.URL.Query()
	q.Add("qrKey", qrKey)
	req.URL.RawQuery = q.Encode()
	_, err = http.DefaultClient.Do(req)
	if err != nil {
		log.Print(err)
		// Wakeup failed, but the show might go on
		return
	}
}

func listenPusherChannels() {
	const eventNotifScan = "maze-scan"
	const eventCast = "maze-cast"

	pusherClient, err := pusher.NewClient(coolMazePusherAppKey)
	checkerr(err)
	err = pusherClient.Subscribe(qrKey)
	checkerr(err)
	log.Println("Listening to pusher channel", qrKey)

	go func() {
		dataNotifScan, err := pusherClient.Bind(eventNotifScan)
		checkerr(err)
		for evt := range dataNotifScan {
			// log.Println(evt.Event, evt.Data)

			var r Response
			err = json.Unmarshal([]byte(evt.Data), &r)
			checkerr(err)
			thumbBase64 := r["message"].(string)
			thumb, err := extractThumbnail(thumbBase64)
			checkerr(err)
			// TODO display thumbnails
			_ = thumb
		}
	}()

	go func() {
		dataCast, err := pusherClient.Bind(eventCast)
		checkerr(err)
		folder := ""
		downloaded := 0
		for evt := range dataCast {
			log.Println(evt.Event, evt.Data)

			var r Response
			err = json.Unmarshal([]byte(evt.Data), &r)
			checkerr(err)

			multiCount, multi := r["multiCount"]
			if multi {
				multiCount, err := strconv.Atoi(multiCount.(string))
				checkerr(err)
				if folder == "" {
					folder, err = ioutil.TempDir("", "coolmaze")
					checkerr(err)
				}
				url := r["message"].(string)
				filepath, err := download(url, folder)
				checkerr(err)
				downloaded++
				log.Println("Successfully downloaded to", filepath)
				if downloaded == multiCount {
					// All resources downloaded :)
					viewFolder(folder)
					// Ready to receive new salvo
					downloaded = 0
					folder = ""
				}
			} else {
				msg := r["message"].(string)
				if strings.HasPrefix(msg, "http://") || strings.HasPrefix(msg, "https://") {
					url := msg
					filepath, err := download(url, "")
					checkerr(err)
					log.Println("Successfully downloaded to", filepath)
					view(filepath)
				}
			}
		}
	}()
}

func download(url, localdir string) (localpath string, err error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Status: %v", resp.Status)
	}
	tmpfile, err := ioutil.TempFile(localdir, "")
	if err != nil {
		return "", err
	}
	defer tmpfile.Close()
	_, err = io.Copy(tmpfile, resp.Body)
	if err != nil {
		return "", err
	}
	return tmpfile.Name(), nil
	// TODO look at Content-Disposition response header and
	// rename file.
}

func view(filepath string) {
	// TODO open freshly downloaded resource

	// Well, this one would only work on some linuxes
	err := exec.Command("xdg-open", filepath).Run()
	checkerr(err)
}

func viewFolder(path string) {
	// Well, this one would only work on some linuxes
	err := exec.Command("xdg-open", path).Run()
	checkerr(err)
}

func extractThumbnail(b64data string) (image.Image, error) {
	// TODO decode thumbnail

	// thumb := strings.Replace(somethumb, "\n", "", -1)
	// pngData, err = base64.StdEncoding.DecodeString(thumb)
	// checkerr(err)
	// pngReader := bytes.NewBuffer(pngData)

	return nil, nil
}

func checkerr(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

var letters = []rune("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")

// See http://stackoverflow.com/a/22892986/871134
func randSeq(length int) string {
	b := make([]rune, length)
	for i := range b {
		n := rnd(len(letters))
		b[i] = letters[n]
	}
	return string(b)
}

func rnd(n int) int {
	// Not secure
	// return rand.Intn(n)

	// Secure
	max := big.NewInt(int64(n))
	i, err := rand.Int(rand.Reader, max)
	checkerr(err)
	return int(i.Int64())
}

type Response map[string]interface{}

func (r Response) String() (s string) {
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		s = ""
		return
	}
	s = string(b)
	return
}

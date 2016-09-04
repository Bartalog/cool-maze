package coolmaze

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

var rndOnce sync.Once

func randomize() {
	rand.Seed(time.Now().UnixNano())
}

func randomString() string {
	x, y := rand.Intn(1234567), rand.Intn(1234567)
	return fmt.Sprintf("%x%x", x, y)
}

func randomGcsObjectName() string {
	d := time.Now().Format("2006-01-02")
	f := randomString()
	return d + "/" + f
}

// Response is a generic container suitable to be directly converted into a JSON HTTP response.
// See http://nesv.blogspot.fr/2012/09/super-easy-json-http-responses-in-go.html
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

func pow(a, b int) int {
	x := 1
	for i := 0; i < b; i++ {
		x *= a
	}
	return x
}

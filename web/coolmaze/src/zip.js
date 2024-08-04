import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';
import {using} from './backend.js';

// The JSZip dependency is super-expensive, though it is used only in niche cases.
import JSZip from 'jszip';
import FileSaver from 'file-saver';

function makeZip(resourceURLs, setZipProgress){
    console.debug("makeZip(" + resourceURLs + ")");

    // Some resources may be unavailable, yet it's useful to be able
    // to generate a ZIP of the resources that we do already have.
    // Just skip the missing resource URLs.
    var original_n = resourceURLs.length;
    resourceURLs = resourceURLs.filter(url => url);

    var n = resourceURLs.length;
    if(n===0){
      alert("No complete resource, can't make a ZIP :(");
      return;
    }
    if(n!==original_n){
      if(!window.confirm("Generate ZIP for " + n + " resources?"))
        return;
      console.log("Generating partial ZIP: " + n + " files out of " + original_n);
    }

    var filename = Array(n);
    var filedata = Array(n);
    setZipProgress(0.10);
  
    var generate = function() {
      var zip = new JSZip();
      for(var j=0; j<n; j++)
        zip.file(filename[j], filedata[j], {binary: true});
      zip.generateAsync({type:"blob"})
        .then(function(content) {
        let now = new Date().toISOString().replace(/T/, "_").replace(/[-:Z]/g, "").slice(0,15); // e.g. "20190909_130830"
        let zipFilename = "resources-from-mobile_" + now + ".zip"; // TODO i18n this: zip.zipFilenamePrefix
        FileSaver.saveAs(content, zipFilename);
      });
    }
  
    var m = n; // how many resources not received yet?
    var filenamesSet= new Set();
  
    function addToZip(i) {
      var oReq = new XMLHttpRequest();
      oReq.open("GET", resourceURLs[i], true);
      oReq.responseType = "arraybuffer";
      
      oReq.onload = function(oEvent) {
        var arrayBuffer = oReq.response;
        var cdName = extractFilename(oReq.getResponseHeader("Content-Disposition")) || ("file"+i);

        // Make sure all filenames in ZIP are unique
        var name = cdName;
        var j=0;
        while(filenamesSet.has(name)) {
          j++;
          name = numberFilename(cdName, j);
        }
        filenamesSet.add(name);
        // TODO when "filename is unknown" (or a placeholder), try to guess a correct file extension, from mime type?

        filename[i] = name;
        // console.debug(filename[i]);
        filedata[i] = arrayBuffer;
        m--;
        setZipProgress(0.10 + 0.9*((n-m)/n));
        if (m===0)
          generate();
        //console.debug(m + " left");
      };
      oReq.send();
    }
  
    for(var i=0; i<n; i++)
      addToZip(i);
}

// "photo.jpg", 2 => "photo_2.jpg"
// "resource", 2 => resource_2
function numberFilename(f, k) {
  if (!f) {
    return `${k}`;
  }
  let pos = f.lastIndexOf('.');
  if (pos == -1) {
    return f + "_" + k;
  }
  let name = f.slice(0, pos);
  let extension = f.slice(pos+1);
  return `${name}_${k}.${extension}`;
}

function makeZipFromE2EE(items, setZipProgress){
  // With E2EE the clear resources local. Let's build a zip
  // out of already-decrypted in-memory data.
  console.debug("makeZipFromE2EE()");

  // Some resources may be unavailable, yet it's useful to be able
  // to generate a ZIP of the resources that we do already have.
  // Just skip the missing resources.
  var original_n = items.length;
  items = items.filter(item => item.resourceData_b64);

  var n = items.length;
  if(n===0){
    alert("No complete resource, can't make a ZIP :(");
    return;
  }
  if(n!==original_n){
    if(!window.confirm("Generate ZIP for " + n + " resources?"))
      return;
    console.debug("Generating partial ZIP: " + n + " files out of " + original_n);
    using(`download/zip/partial/${n}/${original_n}`);
  }

  setZipProgress(0.10);

  var zip = new JSZip();

  var filenamesSet= new Set();
  for(var j=0; j<n; j++) {
    // Make sure all filenames in ZIP are unique
    let filenameOriginal = items[j].resourceFilename;
    if (!filenameOriginal) {
      filenameOriginal = "shared-resource";
    }
    let filename = filenameOriginal;
    let k=0;
    while(filenamesSet.has(filename)) {
      k++;
      filename = numberFilename(filenameOriginal, k);
    }
    filenamesSet.add(filename);
    // TODO when "filename is unknown" (or a placeholder), try to guess a correct file extension, from mime type?

    zip.file(filename, items[j].resourceData_b64, {base64: true});
    let ratio = 0.10 + 0.9*((1+j)/n);
    setZipProgress(ratio);
  }
  zip.generateAsync({type:"blob"})
    .then(function(content) {
      let now = new Date().toISOString().replace(/T/, "_").replace(/[-:Z]/g, "").slice(0,15); // e.g. "20190909_130830"
      let zipFilename = "resources-from-mobile_" + now + ".zip";
      FileSaver.saveAs(content, zipFilename);
      using(`download/zip/${n}/success`);
    }).catch( err => {
      using(`download/zip/${n}/failed`);
    });
}

function extractFilename(contentDisposition) {
    var filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
    var matches = filenameRegex.exec(contentDisposition);
    if (matches != null && matches[1]) { 
      var filename = matches[1].replace(/['"]/g, '');
      //console.debug("extractFilename(" + contentDisposition + ") -> " + filename);
      return filename;
    }
}

class Progress extends Component {
    render() {
      const { t } = this.props;
      var ratio = this.props.ratio;
      if(!ratio) {
        return null;
      }
      //console.debug("ZipProgress ratio="+ratio)
      var clazz = "";
      var checkMark = null;
      if(ratio > 0.999){
        clazz = "complete";
        checkMark = "✓";
      }
      return (
        <div className="zip-progress">
          {t('zip.makingZIP')}
          <progress value={ratio*100} min="0" max="100" className={clazz}>0%</progress>
          {checkMark}
        </div>
      );
    }
}

export const MakeZip = makeZip;
export const MakeZipFromE2EE = makeZipFromE2EE;
export const ZipProgress = withTranslation()(Progress);
import React from 'react';
import FaFilePdfO from 'react-icons/lib/fa/file-pdf-o';
import FaFileO from 'react-icons/lib/fa/file-o';

/*
    Try to display an appropriate icon, according to the mime-type and filename.
    Currently supports:
    - PDF,
    - generic file.
*/

export default function ResourceIcon(props) {
    let resourceType = props.resourceType || "";
    let filename = props.resourceFilename || "";
    //console.debug(resourceType + ',' + filename);
    let size = 140;
    if( /\/pdf/.test(resourceType) || filename.endsWith(".pdf") )
        return <FaFilePdfO size={size} /> ;
    // Default
    return <FaFileO size={size} /> ;
}
  
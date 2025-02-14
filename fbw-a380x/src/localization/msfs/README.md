# locPak Localization

Only change the `en-US.locPak` file. 

The other files are generated automatically from Localazy and any changes will be overwritten.

## Uploading new keys and changed default texts

Add new keys to the `en-US.locPak` file.
Make changes to default texts in the `en-US.locPak` file.
                               
Change to the localization folder:

`cd fbw-a380x/src/localization`

Use the following commands to upload the file to Localazy (Localazy CLI npm package is required):

`localazy upload -w <writeKey> -c localazy-locPak-upload-config.json -d msfs`

CAUTION: Use this command if you want to deprecate keys which are not present in the source file. 

`localazy upload -w <writeKey> -c localazy-locPak-upload-deprecate-config.json -d msfs`

Use the option `-s` for a test run. Remove this option to actually upload the file.

## Find all keys used in the xml files

`find . -name "*.xml" -type f -exec grep -o 'TT:[^<]*' {} \; | sort | uniq`
Search for tooltip tags strings: '(?<=.*>).*?(?=</.*TIP)' 
Search for tooltip tags strings not starting with TT:: '(?<=.*>)(?!TT).*?(?=</.*TIP)' 

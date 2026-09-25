#!/bin/bash
# usage: ./geolocate.sh /path/to/photos

for file in "$1"/*.HEIC "$1"/*.heic "$1"/*.jpg; do
  [ -e "$file" ] || continue
  coords=$(exiftool -n -GPSLatitude -GPSLongitude -T "$file")
  lat=$(echo "$coords" | awk '{print $1}')
  lon=$(echo "$coords" | awk '{print $2}')
  echo "$file -> $lat,$lon | https://www.google.com/maps?q=$lat,$lon"
done

//Load dependencies
var ftpd = require('ftpd');
var fs = require('fs');
var alasql = require('alasql');
var express = require('express');
var os = require('os');
var app = express();
var server;

//Set FTP server Host and Port
var interfaces = os.networkInterfaces();
var addresses = [];
for (var k in interfaces) {
    for (var k2 in interfaces[k]) {
        var address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
            addresses.push(address.address);
        }
    }
}
var options = {
  host: process.env.IP || addresses[0],
  port: process.env.PORT || 21,
  tls: null,
};

//Admin variables
var currentEventCode = '';
var currentEventName = '';
var devMode = true;


app.set('view engine', 'pug');
app.set('views', './views');
app.use(express.static('./views'));

//Create Database Table
alasql('CREATE TABLE athletes (Bib INT PRIMARY KEY, FirstName STRING, LastName STRING, Age INT, Sex STRING, City STRING, State STRING, Email STRING, Event STRING, AgeGroup STRING, AgeGroupPlace INT, AgeGroupTotal INT, SexPlace INT, SexTotal INT, OverallPlace INT, OverallTotal INT, TotalTime STRING, TotalTimeMS INT, Segment1Name STRING, Segment1Time STRING, Segment1Pace STRING, Segment2Name STRING, Segment2Time STRING, Segment2Pace STRING, Segment3Name STRING, Segment3Time STRING, Segment3Pace STRING, Segment4Name STRING, Segment4Time STRING, Segment4Pace STRING, Segment5Name STRING, Segment5Time STRING, Segment5Pace STRING, Segment6Name STRING, Segment6Time STRING, Segment6Pace STRING, Segment7Name STRING, Segment7Time STRING, Segment7Pace STRING, Segment8Name STRING, Segment8Time STRING, Segment8Pace STRING, Segment9Name STRING, Segment9Time STRING, Segment9Pace STRING, Segment10Name STRING, Segment10Time STRING, Segment10Pace STRING )');

//Routes
app.get('/', function (req, res) {
  res.render('index');
});

app.get('/admin', function (req, res) {
  res.render('admin');
});

app.get('/list', function (req, res) {
  res.send(listDatabase());
});

app.get('/list/:event', function (req, res) {
  res.send(listDatabaseEventJSON(req.params));
});

app.get('/results', function (req, res) {
  res.send(listDatabaseEvent(currentEventCode));
});

app.get('/currentEvent', function (req, res){
  res.send(currentEventName);
});

app.get('/devMode', function (req, res){
  res.send(devMode);
});

app.post('/set/currentEventCode/:code', function (req, res){
  currentEventCode = req.params.code;
  console.log(currentEventCode);
});

app.post('/set/currentEventName/:name', function (req, res){
  currentEventName = req.params.name;
  console.log(currentEventName);
});

app.post('/set/devMode/', function (req, res){
  if (devMode) {
    devMode = false;
  }else {
    devMode = true;
  }
  console.log(devMode);
});

//Check dir for .csv files
function checkDir(directory) {
  var fileLocation = __dirname + directory;
  fs.readdir(fileLocation,function(err, files) {
    files.forEach(function(file){
      //Check if file is of type .csv
      if(file.search('.csv')>=0){
        console.log(file + ' is of type .csv');
        console.log('Parsing ' + file);
        //Run csv parser
        parseCSV('"' + fileLocation + file + '"');
        //Rename file to filename.bak
        fs.rename(fileLocation + file, fileLocation + file.replace('.csv','.'+Date.now()+'.bak'), function(err){if(err){console.error(err);}});
        console.log('----');
      }else{
        console.log(file + ' is not of type .csv');
        console.log('----');
      }
    });
  });
}

//Parse CSV into database table
function parseCSV(filePath){
  alasql('SELECT * FROM CSV('+filePath+', {headers:true})',[],function(data){
    //Create INSERT columns from CSV columns
    var keyString = "";
    var keyArray = Object.keys(data[0]);
    keyArray.forEach(function(key){
      keyString = keyString.concat(key,", ");
    });

    //Add TotalTimeMS to INSERT Keys
    keyString = keyString.concat("TotalTimeMS");

    //INSERT each athlete into database
    data.forEach(function(athlete){
      var valueString = "";
      var upsertValues = "";
      //Create SQL friendly syntax
      keyArray.forEach(function(key){
        if(athlete[key] === parseInt(athlete[key],10)){
          valueString = valueString.concat(athlete[key],", ");
          upsertValues = upsertValues.concat(key," = ",athlete[key],", ");
        }else {
          valueString = valueString.concat("'",athlete[key],"'",", ");
          upsertValues = upsertValues.concat(key," = ","'",athlete[key],"'",", ");
        }
      });
      upsertValues = upsertValues.concat("TotalTimeMS = ",timeString2ms(athlete.TotalTime));
      valueString = valueString.concat(timeString2ms(athlete.TotalTime));
      //console.log(upsertValues);
      //console.log(valueString);
      alasql("IF EXISTS (SELECT * FROM athletes WHERE Bib = "+athlete.Bib+") UPDATE athletes SET "+upsertValues+" WHERE Bib = "+athlete.Bib+" ELSE INSERT INTO athletes ("+keyString+") VALUES ("+valueString+")");
    });
  });
}

function listDatabaseEventJSON(events){
  return alasql("SELECT * FROM athletes WHERE Event = '"+events.event+"' AND TotalTimeMS <> 0 ORDER BY TotalTimeMS ASC");
}

function listDatabaseEvent(event){
  return alasql("SELECT * FROM athletes WHERE Event = '"+event+"' AND TotalTimeMS <> 0 ORDER BY TotalTimeMS ASC");
  //Enable to select all athletes
  //return alasql("SELECT * FROM athletes WHERE TotalTimeMS <> 0 ORDER BY TotalTimeMS ASC");
}

function listDatabase(){
  return alasql("SELECT * FROM athletes");
}

function timeString2ms(a,b){// time(HH:MM:SS.ss)
 return a=a.split('.'),
  b=a[1]*1||0,
  b=b*1e1,
  a=a[0].split(':'),
  b+(a[2]?a[0]*3600+a[1]*60+a[2]*1:a[1]?a[0]*60+a[1]*1:a[0]*1)*1e3
}

//Start app server
app.listen(80, function () {
  console.log('App Server listening on port 80.');
});

//Start FTP server
server = new ftpd.FtpServer(options.host, {
  getInitialCwd: function() {
    return '/ftp';
  },
  getRoot: function() {
    return process.cwd();
  },
  pasvPortRangeStart: 1025,
  pasvPortRangeEnd: 1050,
  tlsOptions: options.tls,
  allowUnauthorizedTls: true,
  useWriteFile: false,
  useReadFile: false,
  uploadMaxSlurpSize: 7000, // N/A unless 'useWriteFile' is true.
});

server.on('error', function(error) {
  console.log('FTP Server error:', error);
});

server.on('client:connected', function(connection) {
  var username = 'username';
  var password = 'password';
  console.log('client connected: ' + connection.remoteAddress);
  connection.on('command:user', function(user, success, failure) {
    if (user) {
      username = user;
      success();
    } else {
      failure();
    }
  });

  connection.on('command:pass', function(pass, success, failure) {
    if (pass) {
      password = pass;
      success(username);
    } else {
      failure();
    }
  });
});

server.debugging = 3;
server.listen(options.port);
console.log('FTP Server listening on port ' + options.port);

//FTP interval check
checkDir('/ftp/');
var timer = setInterval(checkDir,30000,'/ftp/');

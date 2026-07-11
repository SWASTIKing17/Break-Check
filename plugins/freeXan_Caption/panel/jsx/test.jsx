try {
  var logPath = Folder.temp.fsName + '/freexan_syntax_test.txt';
  var f = new File(logPath);
  f.open('w');
  
  var dir = new File('C:/Users/msi/AppData/Roaming/Adobe/CEP/extensions/com.bloomx.freexan.caption/panel/jsx');
  var files = [
    'lib/json2.jsx',
    'core/utils.jsx',
    'core/mogrt.jsx',
    'core/sync.jsx',
    'core/timeline.jsx',
    'core/mogrt_editor.jsx',
    'core/debug_bridge.jsx'
  ];
  
  for (var i = 0; i < files.length; i++) {
    try {
      var fileToTest = new File(dir.fsName + '/' + files[i]);
      if (!fileToTest.exists) {
        f.writeln(files[i] + ': ERROR - File does not exist at ' + fileToTest.fsName);
        continue;
      }
      $.evalFile(fileToTest);
      f.writeln(files[i] + ': OK');
    } catch(e) {
      f.writeln(files[i] + ': ERROR - ' + e.name + ': ' + e.message + ' (Line ' + e.line + ')');
    }
  }
  
  f.close();
} catch(fatal) {
  // Silent fallback
}

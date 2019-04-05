const today = new Date().toDateString().slice(4);

// create poor man's Object.assign method (if absent)
Object.assign = Object.assign ||
function(res,src){
	for (var prop in src){res[prop] = src[prop]}
	return res;
};

// polyfill for String.prototype.trim (from MDN)
String.prototype.trim = String.prototype.trim || function(){return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');}


// DEFINE err_email
const err_email = 'my_email@company.com';////////

// email error message, then throw error
function errorLog(v){// MAY NEED SOME TUNING
	MailApp.sendEmail({
		to: err_email,
		subject: 'Error caught',
		body: v
	});
	throw new Error(v);
}


// return data from nth sheet of a google spreadsheet (n defaults to 0)
function getNthSheetData(file_id,n){
	if (n === undefined){n = 0}
	else if (typeof n !== 'number' || n < 0 || n !== (n|0)){
		errorLog('n must be a non-negative integer\nHere, n is: ' + n);}
	const sheetdata = SpreadsheetApp.openById(file_id).getSheets();
	if (n >= sheetdata.length){
		errorLog('n exceeds maximum number of sheets in file');}
	return sheetdata[n].getDataRange().getValues();
}

// return data from sheet with name from argument "s"
function getNamedSheetData(file_id,s){
	if (n === undefined){return getNthSheetData(file_id,0);}
	if (!s || typeof s !== 'string'){
		errorLog('Missing sheet name or invalid argument type');}
	const sheetdata = getSheetData(file_id).getSheetByName(s);
	return sheetdata ? sheetdata.getDataRange().getValues() : errorLog('Spreadsheet file does not have sheet named ' + s);
}

// returns array of email data objects
function getEmailData(file_id,x){
	const sheet_data_func = typeof x === 'number' ? getNthSheetData : getNamedSheetData,
		  range_values = sheet_data_func(file_id,x),
		  props = range_values.shift(),
		  datax = range_values.map(function(row){
			  return row.reduce(function(a,e,i){return (a[props[i]] = e,a);},{});
		  });
	return datax;
}

// returns an object {item[0].id:0, item[1].id:1, ...}
function dataLookup(r,id){
	return r.reduce(function(a,row,i){return (a[row[id||'id']] = i,a)},{});
}

const valid_email_attrs = ['attachments','bcc','body','cc','htmlBody','inlineImages','name','noReply','replyTo','subject','to','from','name'];
const draftFields = ['to','subject','body'];

// returns email object containing only valid email attributes
function sanitizeEmailObject(x){
	return valid_email_attrs.reduce(function(a,e){
		if (x.hasOwnProperty(e)){a[e] = x[e]}
		return a;
	},{});
}

// converts an email object to an array whose elements are for use with GmailApp methods: createDraft and sendEmail
function convertForGmail(r){
	const zr = [];
	r.forEach(function(x){
		var z = [];
		draftFields.forEach(function(y){
			z.push(x[y]);
			delete x[y];
		});
		z.push(x);
		zr.push(z);
	});
	return zr;
}


// takes an HTML string with variable placeholders and returns a function
function procStringFunc(s){
	var tags = s.match(/{{ *\w+ *}}/g);
	if (!tags){return function(){return s};}
	tags = tags.map(function(e){return e.slice(2,-2).trim()});
	const textShards = s.split(/{{ *\w+ *}}/);
	return function(x){
		return textShards.map(function(e,i){return e + (x[tags[i]] || '')}).join('');};
}

// function gets draft message as a template and returns email object
// the body and subject are returned as functions
function getDraftTemplate(id){
	const draft = GmailApp.getDraft(id).getMessage();
	const data = ['cc','from','replyTo','to','bcc'].reduce(function(a,e){
		var x = draft['get' + e[0].toUpperCase() + e.slice(1)]();
		if (x){a[e] = x}
		return a;
	},{});
	return ['body','subject'].reduce(function(a,e){
		var x = draft['get' + e[0].toUpperCase() + e.slice(1)]();
		if (x){a[e] = procStringFunc(x)}
		return a;
	},data);
}


// arguments:
// src_id :: source data array file id
// file_id :: file id of key-value (2 column) data array
// x :: sheet index number of sheet name
// k :: property key
// funcs :: array of functions to run on each array object
// src_id should not contain a header with the label "id" (otherwise it will overwrite)
// format of file_id: [[key_0,value_0], [key_1,value_1], [k_n,v_n]]
function mergeEmailData(src_id,file_id,x,k,funcs){
	const src_data = getEmailData(src_id,x),
		  data_map = dataLookup(src_data,k),
		  file_data = getNthSheetData(file_id).map(function(row){return Object.assign({id:row[0]},src_data[data_map[row[1]]])});
	
	if (funcs !== undefined && !Array.isArray(funcs)){
		errorLog('mergeEmailData input error: funcs must be an array')}
	return file_data.map(function(x){
		return (funcs || []).reduce(function(a,f){return f(a)},x);
	});
}

// email all email objects in input array
function mailArray(r){
	r.forEach(function(v){
		var mail = sanitizeEmailObject(v);
		mail.from || mail.name ? GmailApp.sendMail(...convertForGmail(mail)) : MailApp.sendMail(mail);
	});
}
// usage: to send an email batch
// mailArray(mergeEmailData('file_id_1','file_id_2',0,'name',[function(x){return x},...]));

// create draft emails for all objects in input array
function genDraftsArray(r){
	r.forEach(function(v){
		GmailApp.createDraft(...convertForGmail(sanitizeEmailObject(v)));// check if destructuring works (was introduced in JS 1.7)
	});
}

// rename file using function as 2nd argument
function renameFile(f,fn){return f.setName(fn(f))}

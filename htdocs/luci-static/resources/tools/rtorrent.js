// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require baseclass';
'require rpc';

function escapeXml(str) {
	return str.replace(/[<>&'"]/g, function(chr) {
		switch(chr) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			case "'": return '&apos;';
			case '"': return '&quot;';
		}
	});
}

function encodeXmlRpcParam(param, depth) {
	var indent = Array(depth + 1).join(' ');
	switch(typeof(param)) {
		case 'string':
			return indent + '<string>' + escapeXml(param) + '</string>\r\n';
		case 'boolean':
			return indent + '<boolean>' + param + '<boolean>\r\n';
		case 'number':
			if (Number.isInteger(param)) {
				return indent + '<int>' + param + '</int>\r\n';
			} else {
				return indent + '<double>' + param + '</double>\r\n';
			}
		case 'object':
			if (param instanceof Date) {
				return indent + '<dateTime.iso8601>'
					+ param.toISOString() + '</dateTime.iso8601>\r\n';
			} else if (Array.isArray(param)) {
				var xml = indent + '<array>\r\n'
					+ indent + '  <data>\r\n'
					+ param.map(element => ''
					+ indent + '    <value>\r\n'
					+ encodeXmlRpcParam(element, depth + 6)
					+ indent + '    </value>\r\n').join('')
					+ indent + '  </data>\r\n'
					+ indent + '</array>\r\n';
				return xml;
			} else {
				var xml = indent + '<struct>\r\n'
					+ Object.entries(param).map(([key, value]) => ''
					+ indent + '  <member>\r\n'
					+ indent + '    <name>' + escapeXml(key) + '</name>\r\n'
					+ indent + '    <value>\r\n'
					+ encodeXmlRpcParam(value, depth + 6)
					+ indent + '    </value>\r\n'
					+ indent + '  </member>\r\n').join('')
					+ indent + '</struct>\r\n';
				return xml;
			}
		default:
			return indent + '<base64>' + btoa(param) + '</base64>\r\n';
	}
}

function encodeXmlRpc(method, params) {
	var xml = '<?xml version="1.0"?>\r\n'
		+ '<methodCall>\r\n'
		+ '  <methodName>' + method + '</methodName>\r\n'
		+ '  <params>\r\n'
		+ params.map(param => ''
		+ '    <param>\r\n'
		+ '      <value>\r\n'
		+ encodeXmlRpcParam(param, 8)
		+ '      </value>\r\n'
		+ '    </param>\r\n').join('')
		+ '  </params>\r\n'
		+ '</methodCall>';
	return xml;
}

function decodeXmlRpc(xml) {
	switch(xml.tagName) {
		case 'string':
			return xml.textContent;
		case 'boolean':
			return xml.textContent === 'true';
		case 'int':
		case 'i4':
		case 'i8':
		case 'double':
			return Number(xml.textContent);
		case 'methodResponse':
		case 'params':
		case 'param':
		case 'value':
		case 'fault':
		case 'array':
			return decodeXmlRpc(xml.firstElementChild);
		case 'data':
			var array = [];
			for (var i = 0, size = xml.childElementCount; i < size; i++) {
				array.push(decodeXmlRpc(xml.children[i]));
			}
			return array;
		case 'struct':
			var object = {};
			for (var i = 0, size = xml.childElementCount; i < size; i++) {
				Object.assign(object, decodeXmlRpc(xml.children[i]));
			}
			return object;
		case 'member':
			return { [ xml.querySelector('name').textContent ]:
				decodeXmlRpc(xml.querySelector('value')) };
		case 'base64':
			return atob(xml.textContent);
		default:
			return xml.textContext;
	}
}

return baseclass.extend({

	rtorrentRpc: rpc.declare({
		object: 'luci.rtorrent',
		method: 'rtorrent_rpc',
		params: [ 'xml' ]
	}),

	rtorrentCall: function(method /*, ... */) {
		var params = this.varargs(arguments, 1);
		return Promise.resolve(this.rtorrentRpc(encodeXmlRpc(method, params))).then(function(response) {
			if ('error' in response) {
				// TODO
			} else {
				return decodeXmlRpc(new DOMParser()
					.parseFromString(response['xml'], 'text/xml').documentElement);
			}
		});
	},

	rtorrentMulticall: function(methodType, hash, filter /*, ... */) {
		var methods = this.varargs(arguments, 3);
	},

	rtorrentBatchcall: function(methodType, hash /*, ... */) {
		var methods = this.varargs(arguments, 2);
	}

});

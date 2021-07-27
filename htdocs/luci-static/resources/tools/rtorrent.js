// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require baseclass';
'require rpc';

const domParser = new DOMParser();
const rtorrentRpc = rpc.declare({
	object: 'luci.rtorrent',
	method: 'rtorrent_rpc',
	params: [ 'xml' ]
});

function escapeXml(str) {
	return str.replace(/[<>&'"]/g, function(chr) {
		switch (chr) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			case "'": return '&apos;';
			case '"': return '&quot;';
		}
	});
}

function encodeXmlRpcParam(param) {
	switch (typeof(param)) {
		case 'string':
			return '<string>' + escapeXml(param) + '</string>';
		case 'boolean':
			return '<boolean>' + param + '<boolean>';
		case 'number':
			if (Number.isInteger(param)) {
				return '<int>' + param + '</int>';
			} else {
				return '<double>' + param + '</double>';
			}
		case 'object':
			if (param instanceof Date) {
				return '<dateTime.iso8601>' + param.toISOString() + '</dateTime.iso8601>';
			} else if (Array.isArray(param)) {
				let xml = '<array>'
					+   '<data>'
					+ param.map(element => ''
					+     '<value>'
					+ encodeXmlRpcParam(element)
					+     '</value>').join('')
					+   '</data>'
					+ '</array>';
				return xml;
			} else {
				let xml = '<struct>'
					+ Object.entries(param).map(([key, value]) => ''
					+   '<member>'
					+     '<name>' + escapeXml(key) + '</name>'
					+     '<value>'
					+ encodeXmlRpcParam(value)
					+     '</value>'
					+   '</member>').join('')
					+ '</struct>';
				return xml;
			}
		default:
			return '<base64>' + btoa(param) + '</base64>';
	}
}

function encodeXmlRpc(method, params) {
	let xml = '<?xml version="1.0"?>'
		+ '<methodCall>'
		+   '<methodName>' + method + '</methodName>'
		+   '<params>'
		+ params.map(param => ''
		+     '<param>'
		+       '<value>'
		+ encodeXmlRpcParam(param)
		+       '</value>'
		+     '</param>').join('')
		+   '</params>'
		+ '</methodCall>';
	return xml;
}

function decodeXmlRpc(xml) {
	switch (xml.tagName) {
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
			let array = [];
			for (let i = 0, size = xml.childElementCount; i < size; i++) {
				array.push(decodeXmlRpc(xml.children[i]));
			}
			return array;
		case 'struct':
			let object = {};
			for (let i = 0, size = xml.childElementCount; i < size; i++) {
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

function toCamelCase(str) {
	return str.toLowerCase().replace(/[.,_=\s]+(.)?/g, (_, chr) => chr ? chr.toUpperCase() : '');
}

return baseclass.extend({
	'rtorrentCall': async function(method, ...params) {
		let response = await rtorrentRpc(encodeXmlRpc(method, params));
		if ('error' in response) {
			// TODO
			return [[]];
		} else {
			return decodeXmlRpc(domParser.parseFromString(response.xml, 'text/xml').documentElement);
		}
	},
	'rtorrentMulticall': async function(methodType, hash, filter, ...commands) {
		const method = (methodType === 'd.') ? 'd.multicall2' : methodType + 'multicall';
		const completeCommands = commands.map(cmd => methodType + cmd + (cmd.includes('=') ? '' : '='));
		const results = await this.rtorrentCall(method, hash, filter, ...completeCommands);
		return results.map(result => {
			let object = {};
			commands.forEach((key, i) => object[ toCamelCase(key) ] = result[i]);
			return object;
		});
	},
	'rtorrentBatchcall': async function(methodType, hash, ...commands) {
		let methods = [];
		commands.forEach(cmd => {
			let params = [ hash ];
			if (cmd.includes('=')) {
				params.push(...cmd.split('=')[1].split(','));
			}
			methods.push({ methodName: methodType + cmd.split('=')[0], params });
		});
		const results = await this.rtorrentCall('system.multicall', methods);
		let object = {};
		results.forEach((result, i) => object[ toCamelCase(commands[i]) ]
			= (result.length === 1) ? result[0] : result);
		return object;
	},
	'computeValues': function(data, compute) {
		data.forEach((row, index) => {
			compute.forEach((func, key) => {
				row[ key ] = func(key, row, index, data);
			});
		});
		return data;
	},
	'formatValues': function(data, format) {
		return data.map((row, index) => Object.keys(row).reduce((result, key) => {
			result[ key ] = (key in format)
				? format[ key ](row[ key ], key, row, index, data) : row[ key ];
			return result;
		}, {}));
	},
	'updateTable': function(table, data, formattedData, placeholder) {
		const titles = Array.from(table.querySelectorAll('.tr.table-titles .th'));
		const rows = Array.from(table.querySelectorAll('.tr[ data-key ]'));
		data.filter(dataRow => dataRow.key).forEach((dataRow, rowIndex) => {
			let row = table.querySelector(`.tr[ data-key="${dataRow.key}" ]`);
			if (row) {
				rows.splice(rows.indexOf(row), 1);
			} else {
				row = table.appendChild(E('tr', { 'data-key': dataRow.key, 'class': 'tr' }));
				titles.forEach(title => row.appendChild(E('td', {
					'data-key': title.dataset.key, 'class': title.className
				})).classList.replace('th', 'td'));
			}
			titles.filter(title => title.dataset.key).forEach(title => {
				const td = row.querySelector(`.td[ data-key = "${title.dataset.key}" ]`);
				if (td.dataset.raw != dataRow[ title.dataset.key ]) {
					td.dataset.raw = dataRow[ title.dataset.key ];
					const content = formattedData[ rowIndex ][ title.dataset.key ];
					if (isElem(content)) {
						while (td.firstChild) { td.removeChild(td.firstChild); }
						td.appendChild(content);
					} else {
						td.innerHTML = content;
					}
					console.log('updated:', td);
				}
			});
		});
		rows.forEach(deletedRow => table.removeChild(deletedRow));
		table.querySelectorAll('img[ data-src ]').forEach(img => {
			img.setAttribute('src', img.dataset.src); img.removeAttribute('data-src');
		});
		if (placeholder && table.firstElementChild === table.lastElementChild) {
			const row = table.appendChild(E('tr', { 'class': 'tr placeholder' }));
			row.appendChild(E('td', { 'class': 'td' }, placeholder));
		}
	},
	'humanSize': function(bytes) {
		const units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB' ];
		const exp = (bytes > 0) ? Math.floor(Math.log(bytes) / Math.log(1024)) : 0;
		const value = bytes / Math.pow(1024, exp);
		const accuracy = (bytes > 0) ? 2 - Math.floor(Math.log10(value)) : 2;
		return value.toFixed(accuracy >= 0 ? accuracy : 0) + ' ' + units[ exp ];
	},
	'humanDate': function(epoch) {
		return new Date((epoch + new Date().getTimezoneOffset() * -60) * 1000)
			.toISOString().replace('T', ' ').replace('.000Z', '');
	},
	'humanTime': function(sec) {
		const time = new Date(1970, 0, 1);
		time.setSeconds(sec);
		if (time.getMonth() > 0) {
			return '&#8734;';
		} else if (time.getDate() > 1) {
			return (time.getDate() - 1) + 'd<br>' + time.getHours() + 'h ' + time.getMinutes() + 'm';
		} else if (time.getHours() > 0) {
			return time.getHours() + 'h<br>' + time.getMinutes() + 'm ' + time.getSeconds() + 's';
		} else if (time.getMinutes() > 0) {
			return time.getMinutes() + 'm ' + time.getSeconds() + 's';
		} else {
			return time.getSeconds() + 's';
		}
	},
	'getDomain': function(url) {
		return url.match(/:\/\/[^/:]+/) ? new URL(url).hostname : url.split("/").pop().split(".")[0];
	}
});

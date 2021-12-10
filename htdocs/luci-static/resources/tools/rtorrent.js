// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require baseclass';
'require ui';
'require rpc';

const domParser = new DOMParser();
const rtorrentRpc = rpc.declare({
	object: 'luci.rtorrent',
	method: 'rtorrent_rpc',
	params: ['xml']
});

Element.prototype.insertChildAtIndex = function(index, child) {
	if (index >= this.children.length) return this.appendChild(child);
	else return this.insertBefore(child, this.children[index]);
};

function escapeXml(str) {
	return str.replace(/[<>&'"]/g, function(chr) {
		return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[chr];
	});
}

function encodeXmlRpcParam(param) {
	switch (typeof (param)) {
		case 'string':
			return '<string>' + escapeXml(param) + '</string>';
		case 'boolean':
			return '<boolean>' + param + '<boolean>';
		case 'number':
			if (Number.isInteger(param)) return '<int>' + param + '</int>';
			else return '<double>' + param + '</double>';
		case 'object':
			if (param instanceof Date) {
				return '<dateTime.iso8601>' + param.toISOString() + '</dateTime.iso8601>';
			} else if (Array.isArray(param)) {
				const values = param.map(v => '<value>' + encodeXmlRpcParam(v) + '</value>').join('');
				return `<array><data>${values}</data></array>`;
			} else {
				const members = Object.entries(param).map(([key, value]) => '<member>'
					+ '<name>' + escapeXml(key) + '</name>'
					+ '<value>' + encodeXmlRpcParam(value) + '</value>'
					+ '</member>').join('');
				return `<struct>${members}</struct>`;
			}
		default:
			return '<base64>' + btoa(param) + '</base64>';
	}
}

function encodeXmlRpc(method, params) {
	return '<?xml version="1.0"?>'
		+ '<methodCall>'
		+ '<methodName>' + method + '</methodName>'
		+ '<params>' + params.map(param => '<param>'
			+ '<value>' + encodeXmlRpcParam(param) + '</value>'
			+ '</param>').join('') + '</params>'
		+ '</methodCall>';
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
			const array = [];
			for (let i = 0, size = xml.childElementCount; i < size; i++) {
				array.push(decodeXmlRpc(xml.children[i]));
			}
			return array;
		case 'struct':
			const object = {};
			for (let i = 0, size = xml.childElementCount; i < size; i++) {
				Object.assign(object, decodeXmlRpc(xml.children[i]));
			}
			return object;
		case 'member':
			return { [xml.querySelector('name').textContent]: decodeXmlRpc(xml.querySelector('value')) };
		case 'base64':
			return atob(xml.textContent);
		default:
			return xml.textContext;
	}
}

function toCamelCase(str) {
	return str.toLowerCase().replace(/[.,_=\s]+(.)?/g, (_, chr) => chr ? chr.toUpperCase() : '');
}

function unique(value, index, array) { return array.indexOf(value) === index; }

function blank(value) { return value.trim(); }

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

return baseclass.extend({
	// Executes a single rTorrent XMLRPC call.
	'rtorrentCall': async function(method, ...params) {
		// console.log('xml request', encodeXmlRpc(method, params));
		const response = await rtorrentRpc(encodeXmlRpc(method, params));
		// console.log('xml response', response);
		if ('error' in response) {
			// TODO
			console.log('xml-rpc error', response);
			return [[]];
		} else {
			return decodeXmlRpc(domParser.parseFromString(response.xml, 'text/xml').documentElement);
		}
	},
	// Iterates over all items in view and calls the given commands on each.
	'rtorrentMulticall': async function(methodType, hash, filter, ...commands) {
		const method = (methodType === 'd.') ? 'd.multicall2' : methodType + 'multicall';
		const completeCommands = commands.map(cmd => methodType + cmd + (cmd.includes('=') ? '' : '='));
		const response = await this.rtorrentCall(method, hash, filter, ...completeCommands);
		return response.map(result => commands.reduce((object, command, i) => {
			object[toCamelCase(command)] = result[i];
			return object;
		}, {}));
	},
	// Allows multiple commands to be sent in one XMLRPC request.
	'rtorrentBatchcall': async function(...commands) {
		const methods = [];
		commands.flat().forEach(command => {
			const params = [];
			if (command.includes('=')) {
				params.push(...command.split('=').slice(1).join('=').split(','));
			}
			methods.push({ methodName: command.split('=')[0], params });
		});
		const response = (methods.length > 0) ? await this.rtorrentCall('system.multicall', methods) : [];
		const buildResult = cmdGroup => cmdGroup.reduce((object, command) => {
			const result = response.shift();
			let key = command.replace(/=\w{40}/, '').match(/^\w+\.(.*)/)[1];
			let value = (result.length === 1) ? result[0] : result;
			if (key.startsWith('multicall')) {
				const subCommands = command.split(',').slice(2)
					.map(subCommand => toCamelCase(subCommand.match(/^\w+\.([^,]+)/)[1]));
				key = key.split(',')[0];
				value = value.map(subResults => subResults.reduce((subObject, subResult, i) => {
					subObject[subCommands[i]] = subResult;
					return subObject;
				}, {}));
			}
			object[toCamelCase(key)] = value;
			return object;
		}, {});
		return commands.length > 0 && Array.isArray(commands[0])
			? commands.map(buildResult) : buildResult(commands);
	},
	'computeValues': function(compute, data, ...extraData) {
		data.forEach((row, index) => {
			compute.forEach((func, key) => row[key] = func(key, row, index, data, ...extraData));
		});
		return data;
	},
	'formatValues': function(format, data, ...extraData) {
		return data.map((row, index) => Object.keys(row).reduce((result, key) => {
			result[key] = (key in format)
				? format[key](row[key], key, row, index, data, ...extraData) : row[key];
			return result;
		}, {}));
	},
	'updateTable': function(table, data, formattedData, placeholder) {
		const titles = Array.from(table.querySelectorAll('.tr.table-titles .th'));
		const rows = Array.from(table.querySelectorAll('.tr[data-key]'));
		data.filter(dataRow => 'key' in dataRow).forEach((dataRow, rowIndex) => {
			let row = table.querySelector(`.tr[data-key="${dataRow.key}"]`);
			if (row) {
				rows.splice(rows.indexOf(row), 1);
			} else {
				row = table.appendChild(E('tr', { 'class': 'tr', 'data-key': dataRow.key }));
				titles.forEach(th => {
					const td = row.appendChild(E('td', {
						'class': th.className, 'data-key': th.dataset.key
					}));
					td.classList.replace('th', 'td');
					td.classList.remove('active');
				});
			}
			if ('tags' in dataRow) { row.dataset.tags = dataRow.tags; }
			titles.filter(title => 'key' in title.dataset).forEach(title => {
				const td = row.querySelector(`.td[data-key = "${title.dataset.key}"]`);
				if (String(td.dataset.raw) !== String(dataRow[title.dataset.key])) {
					td.dataset.raw = dataRow[title.dataset.key];
					const content = formattedData[rowIndex][title.dataset.key];
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
		table.querySelectorAll('img[data-src]').forEach(img => {
			img.src = L.resource('icons/loading.gif');
			this.loadImage(img.dataset.src.split('|'), 5000)
				.then(resolved => img.src = resolved.src)
				.catch(() => img.src = L.resource('icons/unknown_tracker.svg'));
			img.removeAttribute('data-src');
		});
		if (placeholder && table.firstElementChild === table.lastElementChild) {
			const row = table.appendChild(E('tr', { 'class': 'tr placeholder' }));
			row.appendChild(E('td', { 'class': 'td' }, placeholder));
		}
	},
	'sortTable': function(table, sort) {
		const currentActive = table.querySelector('.th.active');
		if (!currentActive || !table.dataset.sort.startsWith(currentActive.dataset.key + '-')) {
			table.querySelectorAll('.th').forEach(th => th.classList.remove('active'));
			const key = table.dataset.sort.split('-')[0];
			table.querySelector(`.th[data-key="${key}"]`).classList.add('active');
		}
		Array.from(table.querySelectorAll('.tr[data-key]')).sort(function(leftRow, rightRow) {
			for (const sortBy of sort[table.dataset.sort]) {
				const [key, order] = sortBy.split('-');
				let leftValue = leftRow.querySelector(`.td[data-key="${key}"]`).dataset.raw;
				let rightValue = rightRow.querySelector(`.td[data-key="${key}"]`).dataset.raw;
				if (order === 'desc') [leftValue, rightValue] = [rightValue, leftValue];
				const compare = (!isNaN(leftValue) && !isNaN(rightValue))
					? leftValue - rightValue : leftValue.toString().localeCompare(rightValue);
				if (compare !== 0) { return compare; }
			}
			return 0;
		}).forEach(tr => table.appendChild(tr));
		const totalRow = table.querySelector('.tr.table-total');
		if (totalRow) { table.appendChild(totalRow); }
	},
	'changeSorting': function(th, sort) {
		const table = th.closest('table');
		const [key, order] = table.dataset.sort.split('-');
		if (th.dataset.key === key) { th.dataset.order = (order === 'asc') ? 'desc' : 'asc'; }
		table.dataset.sort = th.dataset.key + '-' + th.dataset.order;
		this.sortTable(table, sort);
		this.setCookie('rtorrent-' + table.id + '-sort', table.dataset.sort);
		this.updateRowStyle(table);
	},
	'updateTabs': function(table, tabs, total, format, data, ...extraData) {
		const tags = data.map(row => row.tags.split(' ')).flat().filter(blank).sort();
		if (tags.includes('all')) { tags.splice(0, 0, 'all'); }
		if (tags.includes('incomplete')) { tags.splice(1, 0, 'incomplete'); }
		const getTagText = function(tag) {
			if (tag === 'all') return _('All');
			else if (tag === 'incomplete') return _('Incomplete');
			else return capitalize(tag);
		};
		Array.from(tabs.querySelectorAll('li')).filter(li => !tags.includes(li.dataset.tab))
			.forEach(li => tabs.removeChild(li));
		tags.filter(unique).forEach((tag, index) => {
			if (tabs.children[index] === undefined || tabs.children[index].dataset.tab !== tag) {
				tabs.insertChildAtIndex(index, E('li', {
					'class': (tabs.dataset.filter === tag) ? 'cbi-tab' : 'cbi-tab-disabled',
					'data-tab': tag, 'click': ev => this.filterTable(
						table, ev.target, total, format, data, ...extraData)
				}, getTagText(tag)));
			}
		});
		const currentTab = tabs.querySelector('li.cbi-tab');
		this.filterTable(table, (currentTab !== null) ? currentTab : tabs.querySelector('li[data-tab="all"]'),
			total, format, data, ...extraData);
	},
	'filterTable': function(table, tab, total, format, data, ...extraData) {
		const tabs = tab.closest('ul');
		const currentTab = tabs.querySelector('li.cbi-tab');
		if (currentTab !== tab) {
			table.querySelectorAll('input[type=checkbox].action')
				.forEach(cb => [cb.checked, cb.indeterminate] = [false, false]);
			if (currentTab !== null) { currentTab.classList.replace('cbi-tab', 'cbi-tab-disabled'); }
			tab.classList.replace('cbi-tab-disabled', 'cbi-tab');
			tabs.dataset.filter = tab.dataset.tab;
			this.setCookie('rtorrent-' + table.id + '-tab', tabs.dataset.filter);
			this.updateRowStyle(table);
		}
		table.querySelectorAll('.tr[data-key]').forEach(row => {
			const rowHasTag = (' ' + row.dataset.tags + ' ').includes(' ' + tabs.dataset.filter + ' ');
			row.classList.toggle('hidden', !rowHasTag);
			data.filter(dataRow => String(dataRow.key) === String(row.dataset.key))
				.forEach(dataRow => dataRow.hidden = !rowHasTag);
		});
		this.updateTotal(table, total, format, data, ...extraData);
	},
	'updateTotal': function(table, total, format, data, ...extraData) {
		const visibleData = data.filter(row => !row.hidden);
		let totalRow = table.querySelector('.tr.table-total');
		if (visibleData.length <= 1) {
			if (totalRow) table.removeChild(totalRow);
		} else {
			if (!totalRow) {
				totalRow = table.appendChild(E('tr', { 'class': 'tr table-total' }));
				table.querySelectorAll('.tr.table-titles .th').forEach(th => {
					const td = totalRow.appendChild(E('td', {
						'class': th.className, 'data-key': th.dataset.key
					}));
					td.classList.replace('th', 'td');
					td.classList.remove('active');
				});
			}
			Object.entries(total).forEach(([key, func]) => {
				const td = totalRow.querySelector(`.td[data-key="${key}"]`);
				const newValue = func(key, visibleData, ...extraData);
				if (String(td.dataset.raw) !== String(newValue)) {
					td.dataset.raw = newValue;
					const content = (key in format)
						? format[key](newValue, ...extraData) : newValue;
					if (isElem(content)) {
						while (td.firstChild) { td.removeChild(td.firstChild); }
						td.appendChild(content);
					} else {
						td.innerHTML = content;
					}
				}
			});
		}
	},
	'updateCheckbox': function(checkbox) {
		const row = checkbox.closest('tr');
		const table = row.closest('table');
		if (row.classList.contains('table-total')) {
			const totalCheckbox = checkbox;
			let count = 0, selected = 0;
			table.querySelectorAll('.tr[data-key]:not(.hidden) input[type=checkbox].action')
				.forEach(cb => {
					cb.checked = !cb.checked;
					count++;
					selected += cb.checked ? 1 : 0;
				});
			totalCheckbox.indeterminate = selected > 0 && selected < count;
		} else {
			const totalCheckbox = table.querySelector('.tr.table-total input[type=checkbox].action');
			if (totalCheckbox) {
				let count = 0, selected = 0;
				table.querySelectorAll('.tr[data-key]:not(.hidden) input[type=checkbox].action')
					.forEach(cb => [count, selected] = [count + 1, selected + cb.checked ? 1 : 0]);
				totalCheckbox.checked = selected === count;
				totalCheckbox.indeterminate = selected > 0 && selected < count;
			}
		}
	},
	'updateRowStyle': function(table) {
		table.querySelectorAll('.tr:not(.hidden)').forEach((row, i) => {
			const oldRowStyle = 'cbi-rowstyle-' + ((i % 2 === 0) ? '1' : '2');
			const newRowStyle = 'cbi-rowstyle-' + ((i % 2 === 0) ? '2' : '1');
			if (!row.classList.replace(oldRowStyle, newRowStyle)) { row.classList.add(newRowStyle); }
		});
	},
	'buildTorrentTabs': function(hash, tab, tabViews, extraArgs = {}) {
		return E('ul', { 'class': 'cbi-tabmenu' }, tabViews.map(tabView => E('li', {
			'class': (tab === tabView.name) ? 'cbi-tab' : 'cbi-tab-disabled', 'click': () => {
				if (tab !== tabView.name) {
					tabViews.filter(view => view.name === tab).shift().dismiss();
					ui.showModal(null, tabView.render(hash, this.buildTorrentTabs(hash,
						tabView.name, tabViews, extraArgs), extraArgs));
				}
			}
		}, _(tabView.name))));
	},
	// 'resetInputs': function(table) {
	// 	table.querySelectorAll('input, textarea').forEach(element => {
	// 		element.value = this.urlDecode(element.parentNode.dataset.raw);
	// 	});
	// },
	'loadImage': function(sources, timeout) {
		return Promise.any(sources.map(source => new Promise(function(resolve, reject) {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = img.onabort = () => reject('Failed to load image: \"' + source + '\"!');
			setTimeout(() => reject('Timeout of load image: \"' + source + '\"!'), timeout);
			img.src = source;
		})));
	},
	'trackerIcon': function(domains) {
		const icons = [];
		domains.filter(blank).forEach(domain => {
			icons.push('https://' + domain + '/favicon.ico', 'http://' + domain + '/favicon.ico');
			let match;
			while ((match = domain.match(/\w+\.(?<subdomain>(?:\w+\.)+\w+)/)) !== null) {
				icons.push('https://' + match.groups.subdomain + '/favicon.ico');
				icons.push('http://' + match.groups.subdomain + '/favicon.ico');
				domain = match.groups.subdomain;
			}
		});
		return icons;
	},
	'loadingText': function() { return _('Loading...'); },
	'humanSize': function(bytes) {
		const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
		const exp = (bytes > 0) ? Math.floor(Math.log(bytes) / Math.log(1024)) : 0;
		const value = bytes / Math.pow(1024, exp);
		const accuracy = (bytes > 0) ? 2 - Math.floor(Math.log10(value)) : 2;
		return value.toFixed((accuracy >= 0) ? accuracy : 0) + ' ' + units[exp];
	},
	'humanSpeed': function(bytes_per_sec) {
		return this.humanSize(bytes_per_sec) + '/s';
	},
	'humanDate': function(epoch) {
		return new Date((parseInt(epoch) + new Date().getTimezoneOffset() * -60) * 1000)
			.toISOString().replace('T', ' ').replace('.000Z', '');
	},
	'humanTime': function(sec) {
		if (sec < 0) { return '&#8734;'; }
		const time = new Date(1970, 0, 1);
		time.setSeconds(sec);
		if (time.getMonth() > 0) {
			return '&#8734;';
		} else if (time.getDate() > 1) {
			return (time.getDate() - 1) + _('d') + '<br>'
				+ time.getHours() + _('h') + ' ' + time.getMinutes() + _('m');
		} else if (time.getHours() > 0) {
			return time.getHours() + _('h') + '<br>'
				+ time.getMinutes() + _('m') + ' ' + time.getSeconds() + _('s');
		} else if (time.getMinutes() > 0) {
			return time.getMinutes() + _('m') + ' ' + time.getSeconds() + _('s');
		} else {
			return time.getSeconds() + _('s');
		}
	},
	'getDomain': function(url) {
		const match = url.match(/:\/\/(?<domain>[^/:]+)/);
		return match ? match.groups.domain : url.split('/').pop().split('.')[0];
	},
	'urlEncode': function(url) {
		return encodeURIComponent(url).replace(/'/g, '%27').replace(/"/g, '%22');
	},
	'urlDecode': function(encodedUrl) {
		return decodeURIComponent(encodedUrl).replace(/\+/g, ' ');
	},
	'setCookie': function(name, value) {
		document.cookie = name + '=' + this.urlEncode(value) + '; SameSite=Strict';
	},
	'getCookie': function(name) {
		const cookie = document.cookie.split('; ').find(cookie => cookie.startsWith(name + '='));
		return cookie ? this.urlDecode(cookie.split('=')[1]) : undefined;
	},
	'addNotification': function(children, { title = '', classes = [], timeout = 5000 } = {}) {
		const msg = E('div', {
			'class': 'alert-message fade-in', 'style': 'display:flex', 'transitionend': ev => {
				const node = ev.currentTarget;
				if (node.parentNode && node.classList.contains('fade-out'))
					node.parentNode.removeChild(node);
			}
		}, [
			E('div', { 'style': 'flex:10' }, [(title !== '') ? E('h4', title) : '', children]),
			E('div', { 'style': 'flex:1 1 auto; display:flex' }, [
				E('button', {
					'class': 'btn', 'style': 'margin-left:auto; margin-top:auto',
					'click': ev => ev.target.closest('.alert-message').classList.add('fade-out')
				}, _('Dismiss'))
			])
		]);
		const target = document.body.classList.contains('modal-overlay-active')
			? document.querySelector('.modal') : document.querySelector('#maincontent');
		classes.forEach(clazz => msg.classList.add(clazz));
		target.insertBefore(msg, target.firstElementChild);
		if (timeout > 0) {
			// Somehow the transitionend event doesn't trigger when the fade-out is called from setTimeout
			setTimeout(() => { if (msg.parentNode) msg.parentNode.removeChild(msg); }, timeout + 400);
			setTimeout(() => msg.classList.add('fade-out'), timeout);
		}
		return msg;
	}
});

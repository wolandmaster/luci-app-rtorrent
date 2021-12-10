// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require view';
'require poll';
'require ui';
'require tools.rtorrent as tools';
'require view.rtorrent.general as general';
'require view.rtorrent.files as files';
'require view.rtorrent.trackers as trackers';
'require view.rtorrent.peers as peers';
'require view.rtorrent.chunks as chunks';

const tabViews = [general, files, trackers, peers, chunks];

const compute = new Map([[
	'key', function(key, torrent) { return torrent.hash; }], [
	'icon', function(key, torrent) { return torrent.customIcon; }], [
	'size', function(key, torrent) { return torrent.sizeBytes; }], [
	'expectedChunks', function(key, torrent) { return torrent.wantedChunks + torrent.completedChunks; }], [
	'done', function(key, torrent) {
		if (torrent.expectedChunks === torrent.sizeChunks) {
			return 100 * torrent.bytesDone / torrent.sizeBytes;
		} else {
			return Math.min(100 * torrent.completedChunks / torrent.expectedChunks, 100);
		}
	}], [
	'status', function(key, torrent, index, torrents, allTrackers) {
		// 1: down, 2: seed, 3: hash, 4: pause, 5: stop, 6: faulty
		if (torrent.hashing > 0) return 3;
		else if (torrent.state === 0) return 5;
		else if (torrent.isActive === 0) return 4;
		else if (trackers.status(allTrackers[index]['multicall'], torrent)
			.every(tracker => tracker.status === 3 || tracker.status === 5)) return 6;
		else if (torrent.wantedChunks > 0) return 1;
		else return 2;
	}], [
	'seeder', function(key, torrent) { return torrent.peersComplete; }], [
	'leecher', function(key, torrent) { return torrent.peersAccounted; }], [
	'download', function(key, torrent) { return torrent.downRate; }], [
	'upload', function(key, torrent) { return torrent.upRate; }], [
	'eta', function(key, torrent) {
		// 0: already done, Infinity: infinite
		if (torrent.wantedChunks === 0) {
			return 0;
		} else if (torrent.downRate > 0) {
			if (torrent.expectedChunks === torrent.sizeChunks) {
				return (torrent.sizeBytes - torrent.bytesDone) / torrent.downRate;
			} else {
				return torrent.wantedChunks * torrent.chunkSize / torrent.downRate;
			}
		} else {
			return Infinity;
		}
	}], [
	'checked', function() { return 0; }], [
	'tags', function(key, torrent) {
		return 'all ' + ((torrent.wantedChunks > 0) ? 'incomplete ' : '') + torrent.custom1;
	}]
]);

const format = {
	'icon': function(value) {
		return E('img', { 'data-src': value, 'width': '16', 'height': '16', 'title': tools.getDomain(value) });
	},
	'name': function(value, key, row) {
		const extraArgs = { 'torrentActions': action };
		if (key) {
			return E('div', {
				'class': 'link', 'click': () => ui.showModal(null, general.render(row.hash,
					tools.buildTorrentTabs(row.hash, general.name, tabViews, extraArgs), extraArgs))
			}, value);
		} else {
			return value;
		}
	},
	'size': function(value) { return E('div', { 'title': value + ' B' }, [tools.humanSize(value)]); },
	'done': function(value) { return value.toFixed(1) + '%'; },
	'status': function(value) {
		return {
			1: E('div', { 'class': 'green' }, _('down')),
			2: E('div', { 'class': 'blue' }, _('seed')),
			3: E('div', { 'class': 'green' }, _('hash')),
			4: E('div', { 'class': 'orange' }, _('pause')),
			5: E('div', { 'class': 'red' }, _('stop')),
			6: E('div', { 'class': 'faulty' }, _('faulty'))
		}[value] || E('div', {}, _('unknown'));
	},
	'ratio': function(value, key, row) {
		return E('div', {
			'class': (value < 1000) ? 'red' : 'green',
			'title': _('Total uploaded') + ': ' + tools.humanSize(row.upTotal)
		}, (value / 1000).toFixed(2));
	},
	'download': function(value) { return tools.humanSpeed(value); },
	'upload': function(value) { return tools.humanSpeed(value); },
	'eta': function(value, key, row) {
		const downloadStarted = (row.timestampStarted !== 0)
			? tools.humanDate(row.timestampStarted) : _('not yet started');
		const downloadFinished = (row.timestampFinished !== 0)
			? tools.humanDate(row.timestampFinished) : _('not yet finished');
		const text = (value === 0) ? '--' : (value === Infinity) ? '&#8734;' : tools.humanTime(value);
		return E('div', {
			'title': _('Download started') + ': ' + downloadStarted + '\n'
				+ _('Download finished') + ': ' + downloadFinished,
			'class': (value === Infinity || text === '&#8734;') ? 'red' : null
		}, text);
	},
	'checked': function(value) {
		return E('input', {
			'class': 'action', 'type': 'checkbox', 'checked': (value === 1) ? 'checked' : null,
			'change': ev => tools.updateCheckbox(ev.target)
		});
	}
};

const sort = {
	'name-asc': ['name-asc'],
	'name-desc': ['name-desc'],
	'size-asc': ['size-asc', 'name-asc'],
	'size-desc': ['size-desc', 'name-asc'],
	'done-asc': ['done-asc', 'name-asc'],
	'done-desc': ['done-desc', 'name-asc'],
	'status-asc': ['status-asc', 'download-desc', 'upload-desc', 'name-asc'],
	'status-desc': ['status-desc', 'download-desc', 'upload-desc', 'name-asc'],
	'seeder-asc': ['seeder-asc', 'leecher-asc', 'name-asc'],
	'seeder-desc': ['seeder-desc', 'leecher-desc', 'name-asc'],
	'leecher-asc': ['leecher-asc', 'seeder-asc', 'name-asc'],
	'leecher-desc': ['leecher-desc', 'seeder-desc', 'name-asc'],
	'download-asc': ['download-asc', 'upload-asc', 'name-asc'],
	'download-desc': ['download-desc', 'upload-desc', 'name-asc'],
	'upload-asc': ['upload-asc', 'download-asc', 'name-asc'],
	'upload-desc': ['upload-desc', 'download-desc', 'name-asc'],
	'ratio-asc': ['ratio-asc', 'name-asc'],
	'ratio-desc': ['ratio-desc', 'name-asc'],
	'eta-asc': ['eta-asc', 'name-asc'],
	'eta-desc': ['eta-desc', 'name-asc']
};

const total = {
	'name': function(key, data) {
		return _('TOTAL') + ': ' + data.reduce(count => count + 1, 0) + ' ' + _('pcs.');
	},
	'size': function(key, data) { return data.reduce((sum, row) => sum + row[key], 0); },
	'download': function(key, data) { return data.reduce((sum, row) => sum + row[key], 0); },
	'upload': function(key, data) { return data.reduce((sum, row) => sum + row[key], 0); },
	'checked': function() { return 0; }
};

const action = {
	'start': function(values) {
		return tools.rtorrentBatchcall(...values.map(hash => [
			'd.state=' + hash, 'd.is_active=' + hash
		])).then(statuses => tools.rtorrentBatchcall(...values.reduce((commands, hash, i) => {
			if (statuses[i].state === 0) {
				commands.push(['d.name=' + hash, 'd.start=' + hash]);
			} else if (statuses[i].isActive === 0) {
				commands.push(['d.name=' + hash, 'd.resume=' + hash]);
			}
			return commands;
		}, [[]]))).then(results => results.map(result => {
			if (result.start === 0) {
				tools.addNotification(E('h4', [_('Started'), ' ', E('i', result.name)]));
			} else if (result.resume === 0) {
				tools.addNotification(E('h4', [_('Resumed'), ' ', E('i', result.name)]));
			}
			return result;
		}));
	},
	'pause': function(values) {
		return tools.rtorrentBatchcall(...values.map(hash => [
			'd.name=' + hash, 'd.state=' + hash, 'd.is_active=' + hash,
			'd.start=' + hash, 'd.pause=' + hash
		])).then(results => results.map(result => {
			if ((result.state === 0 || result.isActive === 1) && result.start === 0 && result.pause === 0) {
				tools.addNotification(E('h4', [_('Paused'), ' ', E('i', result.name)]));
			}
			return result;
		}));
	},
	'stop': function(values) {
		return tools.rtorrentBatchcall(...values.map(hash => [
			'd.name=' + hash, 'd.state=' + hash, 'd.stop=' + hash, 'd.close=' + hash
		])).then(results => results.map(result => {
			if (result.state === 1 && result.stop === 0 && result.close === 0) {
				tools.addNotification(E('h4', [_('Stopped'), ' ', E('i', result.name)]));
			}
			return result;
		}));
	},
	'hash': function(values) {
		return tools.rtorrentBatchcall(...values.map(hash => [
			'd.name=' + hash, 'd.check_hash=' + hash
		])).then(results => results.map(result => {
			if (result.checkHash === 0) {
				tools.addNotification(E('h4', [_('Checking hashes of'), ' ', E('i', result.name)]));
			}
			return result;
		}));
	},
	'remove': function(values) {
		return tools.rtorrentBatchcall(...values.map(hash => [
			'd.name=' + hash, 'd.close=' + hash, 'd.erase=' + hash
		])).then(results => results.map(result => {
			if (result.close === 0 && result.erase === 0) {
				tools.addNotification(E('h4', [_('Removed'), ' ', E('i', result.name)]));
			}
			return result;
		}));
	},
	'purge': function(values) {
		return tools.rtorrentBatchcall(...values.map(hash => [
			'd.name=' + hash, 'd.custom5.set=' + hash + ',1', 'd.close=' + hash, 'd.erase=' + hash
		])).then(results => results.map(result => {
			if (result.close === 0 && result.erase === 0) {
				tools.addNotification(E('h4', [_('Erased'), ' ', E('i', result.name)]));
			}
			return result;
		}));
	}
};

return view.extend({
	'update': function(tabs, table) {
		tools.rtorrentMulticall('d.', '', 'default',
			'hash', 'name', 'hashing', 'state', 'is_active', 'complete',
			'size_bytes', 'bytes_done', 'size_chunks', 'wanted_chunks', 'completed_chunks', 'chunk_size',
			'peers_accounted', 'peers_complete', 'down.rate', 'up.rate', 'ratio', 'up.total',
			'timestamp.started', 'timestamp.finished', 'custom1', 'custom=icon'
		).then(torrents => tools.rtorrentBatchcall(...torrents.map(torrent => [
			't.multicall=' + torrent.hash + ',,t.is_enabled=,t.success_counter=,t.failed_counter='
		])).then(allTrackers => {
			tools.updateTable(table,
				tools.computeValues(compute, torrents, allTrackers),
				tools.formatValues(format, torrents), _('No torrents added yet.'));
			tools.updateTabs(table, tabs, total, format, torrents);
			tools.sortTable(table, sort);
			tools.updateRowStyle(table);
		}));
	},
	'render': function() {
		const style = E('style', { 'type': 'text/css' }, [
			'.shrink { width: 1% }',
			'.wrap { word-break: break-all }',
			'.nowrap { white-space: pre }',
			'.red { color: #b20000 }',
			'.orange { color: #cc7000 }',
			'.green { color: #00a100 }',
			'.blue { color: #0000bf }',
			'.active { color: #0069d6 }',
			'.faulty { color: #ff0000 }',
			'.hidden { display: none }',
			'.table .th, .table .td { padding: 10px 6px 9px }',
			'.th:not(:empty) { cursor: pointer;  user-select: none }',
			'.tr.table-total .td { font-weight: bold }',
			'.cbi-tab, .cbi-tab-disabled { padding: 4px 6px; cursor: pointer; user-select: none }',
			'.modal { max-width: 900px !important }',
			'div.link:hover { cursor: pointer; color: #0069d6 }',
			'input[type="text"], select { width: 40% !important }',
			'textarea { width: 100% }'
		]);

		const title = E('h2', { 'name': 'content' }, _('Torrent List'));

		const tabs = E('ul', {
			'class': 'cbi-tabmenu',
			'data-filter': tools.getCookie('rtorrent-torrents-tab') || 'all'
		});

		const tableSort = tools.getCookie('rtorrent-torrents-sort') || 'name-asc';
		const table = E('table', { 'class': 'table', 'id': 'torrents', 'data-sort': tableSort }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th shrink', 'data-key': 'icon' }),
				E('th', {
					'class': 'th wrap active', 'data-key': 'name',
					'title': _('Sort by name'), 'data-order': 'asc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Name')),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'size',
					'title': _('Sort by size'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Size')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'done',
					'title': _('Sort by download percentage'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Done')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'status',
					'title': _('Sort by status'), 'data-order': 'asc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Status')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'seeder',
					'title': _('Sort by seeder count'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, '&#9660;'),
				E('th', {
					'class': 'th shrink center', 'data-key': 'leecher',
					'title': _('Sort by leecher count'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, '&#9650;'),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'download',
					'title': _('Sort by download speed'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Download')),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'upload',
					'title': _('Sort by upload speed'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Upload')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'ratio',
					'title': _('Sort by download/upload ratio'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Ratio')),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'eta',
					'title': _('Sort by Estimated Time of Arrival'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('ETA')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'checked'
				})
			])
		]);

		const actionsComboButton = new ui.ComboButton('start', {
			'start': _('Start'),
			'pause': _('Pause'),
			'stop': _('Stop'),
			'hash': _('Check hash'),
			'remove': _('Remove'),
			'purge': _('Remove and delete from disk')
		}, {
			'name': 'cbi.action',
			'sort': ['start', 'pause', 'stop', 'hash', 'remove', 'purge'],
			'classes': {
				'start': 'btn cbi-button important cbi-button-save',
				'pause': 'btn cbi-button important cbi-button-apply',
				'stop': 'btn cbi-button important cbi-button-apply',
				'hash': 'btn cbi-button important cbi-button-apply',
				'remove': 'btn cbi-button important cbi-button-negative',
				'purge': 'btn cbi-button important cbi-button-negative'
			},
			'click': (ev, choice) => {
				const checked = Array.from(table.querySelectorAll(
					'.tr[data-key]:not(.hidden) input[type=checkbox].action:checked'))
					.map(cb => cb.closest('.tr').dataset.key);
				if (checked.length === 0) {
					alert(_('No torrent selected!') + '\n'
						+ _('Please use the checkbox at the end of the torrents.'));
				} else {
					action[choice](checked).then(() => {
						this.update(tabs, table);
						actionsComboButton.setValue('start');
					});
				}
			}
		});
		const actions = E('div', { 'class': 'cbi-page-actions' }, [actionsComboButton.render(), ' ',
			E('input', {
				'class': 'cbi-button cbi-button-reset', 'type': 'reset', 'value': _('Reset'),
				'click': () => {
					table.querySelectorAll('input[type=checkbox].action')
						.forEach(cb => {
							cb.checked = false;
							cb.indeterminate = false;
						});
					actionsComboButton.setValue('start');
				}
			})
		]);

		poll.add(() => this.update(tabs, table), 10);
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') { tabViews.forEach(view => view.dismiss()); }
		});

		return E([], [style, title, tabs, table, actions]);
	},
	// 'doAction': function(key, values) {
	// 	action[key](values); //.then(() => this.update(tabs, table));
	// },
	'handleSaveApply': null,
	'handleSave': null,
	'handleReset': null
});

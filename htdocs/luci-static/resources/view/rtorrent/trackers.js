// Copyright 2014-2022 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require baseclass';
'require poll';
'require ui';
'require tools.rtorrent as tools';

const compute = new Map([[
	'index', function(key, tracker, index) { return index; }], [
	'key', function(key, tracker) { return 't' + tracker.index; }], [
	'icon', function(key, tracker) { return tools.getDomain(tracker.url); }], [
	'status', function(key, tracker, index, trackers, torrent) {
		// 1: working, 2: updating, 3: inactive, 4: stopped, 5: faulty
		if (torrent.state === 0) return 4;
		else if (tracker.isEnabled === 0) return 3;
		else if (tracker.failedCounter === 0 && tracker.successCounter === 0) return 2;
		else if (tracker.failedCounter === 0) return 1;
		else return 5;
	}], [
	'peers', function(key, tracker) { return tracker.latestNewPeers + tracker.latestSumPeers * 1e9; }], [
	'seeds', function(key, tracker) { return tracker.scrapeComplete; }], [
	'leeches', function(key, tracker) { return tracker.scrapeIncomplete; }], [
	'downloads', function(key, tracker) { return tracker.scrapeDownloaded; }], [
	'updated', function(key, tracker) {
		const lastScrape = Math.max(tracker.scrapeTimeLast, tracker.failedTimeLast);
		return (lastScrape === 0) ? -1 : Math.round(Date.now() / 1000) - lastScrape;
	}], [
	'enabled', function(key, tracker) { return tracker.isEnabled; }]
]);

const format = {
	'icon': function(value) {
		return E('img', { 'data-src': tools.trackerIcon([value]).join('|'), 'width': '16', 'height': '16' });
	},
	'status': function(value, key, tracker) {
		const lastSuccess = tracker.successTimeLast !== 0
			? tools.humanDate(tracker.successTimeLast) : _('never succeeded');
		const lastFailed = tracker.failedTimeLast !== 0
			? tools.humanDate(tracker.failedTimeLast) : _('never failed');
		let [text, color] = ['', ''];
		if (value === 1) [text, color] = [_('working'), 'green'];
		else if (value === 2) [text, color] = [_('updating'), 'blue'];
		else if (value === 3) text = _('inactive');
		else if (value === 4) text = _('stopped');
		else if (value === 5) [text, color] = [_('faulty'), 'red'];
		return E('div', {
			'class': color, 'title': _('Last succeeded request: ') + lastSuccess + '\n'
				+ _('Last failed request: ') + lastFailed
		}, text);
	},
	'peers': function(value) {
		const [latestNewPeers, latestSumPeers] = [value % 1e9, Math.floor(value / 1e9)];
		return E('div', { 'title': _('New peers / Peers obtained with last announce') },
			latestNewPeers + '/' + latestSumPeers);
	},
	'updated': function(value) { return tools.humanTime(value); },
	'enabled': function(value) {
		const checkbox = E('input', {
			'class': 'action', 'type': 'checkbox', 'checked': (value === 1) ? 'checked' : null,
			'change': ev => tools.updateCheckbox(ev.target)
		});
		checkbox.indeterminate = (value === -1);
		return checkbox;
	}
};

const sort = {
	'url-asc': ['url-asc'],
	'url-desc': ['url-desc'],
	'status-asc': ['status-asc', 'peers-asc', 'url-asc'],
	'status-desc': ['status-desc', 'peers-desc', 'url-asc'],
	'peers-asc': ['peers-asc', 'seeds-asc', 'leeches-asc', 'url-asc'],
	'peers-desc': ['peers-desc', 'seeds-desc', 'leeches-desc', 'url-asc'],
	'seeds-asc': ['seeds-asc', 'peers-asc', 'leeches-asc', 'url-asc'],
	'seeds-desc': ['seeds-desc', 'peers-desc', 'leeches-desc', 'url-asc'],
	'leeches-asc': ['leeches-asc', 'peers-asc', 'seeds-asc', 'url-asc'],
	'leeches-desc': ['leeches-desc', 'peers-desc', 'seeds-desc', 'url-asc'],
	'downloads-asc': ['downloads-asc', 'peers-asc', 'url-asc'],
	'downloads-desc': ['downloads-desc', 'peers-desc', 'url-asc'],
	'updated-asc': ['updated-asc', 'status-asc', 'url-asc'],
	'updated-desc': ['updated-desc', 'status-asc', 'url-asc'],
	'enabled-asc': ['enabled-asc', 'status-asc', 'url-asc'],
	'enabled-desc': ['enabled-desc', 'status-asc', 'url-asc']
};

const total = {
	'url': function(key, trackers) {
		return _('TOTAL') + ': ' + trackers.reduce(count => count + 1, 0) + ' ' + _('pcs.');
	},
	'peers': function(key, trackers) { return trackers.reduce((sum, tracker) => sum + tracker[key], 0); },
	'seeds': function(key, trackers) { return trackers.reduce((sum, tracker) => sum + tracker[key], 0); },
	'leeches': function(key, trackers) { return trackers.reduce((sum, tracker) => sum + tracker[key], 0); },
	'downloads': function(key, trackers) { return trackers.reduce((sum, tracker) => sum + tracker[key], 0); },
	'enabled': function(key, trackers) {
		const selected = trackers.reduce((sum, tracker) => sum + tracker[key], 0);
		if (selected === 0) return 0;
		else if (selected < trackers.length) return -1;
		else return 1;
	}
};

const action = {
	'addTracker': function(hash, value) {

	},
	'trackerScrape': function(hash, value, pollFn) {
		tools.rtorrentBatchcall('d.tracker.send_scrape=' + hash + ',0', 'd.save_resume=' + hash).then(() => {
			pollFn();
		});
	}
};

return baseclass.extend({
	'name': function() { return 'Trackers'; },
	'update': function(hash, title, table) {
		tools.rtorrentBatchcall(
			'd.name=' + hash, 'd.state=' + hash, 'd.is_active=' + hash
		).then(torrent => tools.rtorrentMulticall('t.', hash, '',
			'is_enabled', 'url', 'latest_new_peers', 'latest_sum_peers',
			'failed_counter', 'success_counter', 'success_time_last', 'failed_time_last',
			'scrape_complete', 'scrape_incomplete', 'scrape_downloaded', 'scrape_time_last'
		).then(trackers => {
			if (title.textContent === tools.loadingText()) { title.textContent = torrent.name; }
			tools.updateTable(table,
				tools.computeValues(compute, trackers, torrent),
				tools.formatValues(format, trackers), _('No trackers of the torrent.'));
			tools.updateTotal(table, total, format, trackers);
			tools.sortTable(table, sort);
			tools.updateRowStyle(table);
		}));
	},
	'render': function(hash, tabs) {
		const title = E('h3', tools.loadingText());

		const tableSort = tools.getCookie('rtorrent-trackers-sort') || 'status-asc';
		const table = E('table', { 'class': 'table', 'id': 'trackers', 'data-sort': tableSort }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th shrink', 'data-key': 'icon' }),
				E('th', {
					'class': 'th wrap', 'data-key': 'url',
					'title': _('Sort by url'), 'data-order': 'asc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Url')),
				E('th', {
					'class': 'th shrink center nowrap active', 'data-key': 'status',
					'title': _('Sort by status'), 'data-order': 'asc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Status')),
				E('th', {
					'class': 'th shrink nowrap center', 'data-key': 'peers',
					'title': _('Sort by peers'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Peers')),
				E('th', {
					'class': 'th shrink nowrap center', 'data-key': 'seeds',
					'title': _('Sort by complete peers'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Seeds')),
				E('th', {
					'class': 'th shrink nowrap center', 'data-key': 'leeches',
					'title': _('Sort by incomplete peers'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Leeches')),
				E('th', {
					'class': 'th shrink nowrap center', 'data-key': 'downloads',
					'title': _('Sort by number of downloads'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Downloads')),
				E('th', {
					'class': 'th shrink nowrap center', 'data-key': 'updated',
					'title': _('Sort by last scrape time'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Updated')),
				E('th', {
					'class': 'th shrink nowrap center', 'data-key': 'enabled',
					'title': _('Sort by enabled state'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Enabled'))
			])
		]);

		const addTracker = E('div', { 'class': 'cbi-value' }, [
			E('br'),
			E('label', { 'class': 'cbi-value-title', 'for': 'add-tracker' }, _('Add tracker(s)')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('textarea', { 'rows': '2', 'id': 'add-tracker' }), E('br'),
				E('div', { 'class': 'cbi-value-description' },
					_('All tracker URL should be in a separate line.'))
			]),
			E('br')
		]);

		this.pollFn = L.bind(this.update, this, hash, title, table);
		this.pollFn();
		poll.add(this.pollFn, 10);

		const actions = E('div', { 'class': 'cbi-page-actions' }, [
			E('input', {
				'class': 'btn cbi-button',
				'type': 'button', 'value': _('Trigger tracker scrape'),
				'click': () => action['trackerScrape'](hash, null, this.pollFn)
			}),
			E('input', {
				'class': 'btn cbi-button cbi-button-add', 'style': 'float: none',
				'type': 'button', 'value': _('Save'),
				'click': () => action['addTracker'](hash, addTracker.querySelectorAll('textarea'))
			}), ' ',
			E('input', {
				'class': 'btn cbi-button', 'style': 'float: none',
				'type': 'button', 'value': _('Dismiss'),
				'click': L.bind(this.dismiss, this)
			})
		]);

		return E([], [title, tabs, table, addTracker, actions]);
	},
	'status': function(trackers, torrent) {
		return tools.computeValues(new Map([['status', compute.get('status')]]), trackers, torrent);
	},
	'dismiss': function() {
		ui.hideModal();
		if (this.pollFn) {
			poll.remove(this.pollFn);
			this.pollFn = null;
		}
	}
});

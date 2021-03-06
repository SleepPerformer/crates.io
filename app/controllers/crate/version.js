import Controller from '@ember/controller';
import PromiseProxyMixin from '@ember/object/promise-proxy-mixin';
import ArrayProxy from '@ember/array/proxy';
import { computed, observer } from '@ember/object';
import { later } from '@ember/runloop';
import $ from 'jquery';
import moment from 'moment';

const NUM_VERSIONS = 5;

const PromiseArray = ArrayProxy.extend(PromiseProxyMixin);

export default Controller.extend({
    isDownloading: false,

    downloadsContext: computed('requestedVersion', 'model', 'crate', function() {
        return this.get('requestedVersion') ? this.get('model') : this.get('crate');
    }),
    downloads: computed.alias('downloadsContext.version_downloads'),
    extraDownloads: computed.alias('downloads.content.meta.extra_downloads'),

    fetchingFollowing: true,
    following: false,
    currentVersion: computed.alias('model'),
    requestedVersion: null,
    keywords: computed.alias('crate.keywords'),
    categories: computed.alias('crate.categories'),
    badges: computed.alias('crate.badges'),

    sortedVersions: computed.readOnly('crate.versions'),

    smallSortedVersions: computed('sortedVersions', function() {
        return this.get('sortedVersions').slice(0, NUM_VERSIONS);
    }),

    hasMoreVersions: computed.gt('sortedVersions.length', NUM_VERSIONS),

    anyLinks: computed.or('crate.{homepage,wiki,mailing_list,documentation,repository,reverse_dependencies}'),

    displayedAuthors: computed('currentVersion.authors.[]', function() {
        return PromiseArray.create({
            promise: this.get('currentVersion.authors').then((authors) => {
                let ret = authors.slice();
                let others = authors.get('meta');
                for (let i = 0; i < others.names.length; i++) {
                    ret.push({ name: others.names[i] });
                }
                return ret;
            })
        });
    }),

    anyKeywords: computed.gt('keywords.length', 0),
    anyCategories: computed.gt('categories.length', 0),

    currentDependencies: computed('currentVersion.dependencies', function() {
        let deps = this.get('currentVersion.dependencies');

        if (deps === null) {
            return [];
        }

        return PromiseArray.create({
            promise: deps.then((deps) => {
                return deps
                    .filter((dep) => dep.get('kind') !== 'dev')
                    .uniqBy('crate_id');
            })
        });
    }),

    currentDevDependencies: computed('currentVersion.dependencies', function() {
        let deps = this.get('currentVersion.dependencies');
        if (deps === null) {
            return [];
        }
        return PromiseArray.create({
            promise: deps.then((deps) => {
                return deps.filterBy('kind', 'dev');
            }),
        });
    }),

    downloadData: computed('downloads', 'extraDownloads', 'requestedVersion', function() {
        let downloads = this.get('downloads');
        if (!downloads) {
            return;
        }

        let extra = this.get('extraDownloads') || [];

        let dates = {};
        let versions = [];
        for (let i = 0; i < 90; i++) {
            let now = moment().subtract(i, 'days');
            dates[now.format('MMM D')] = { date: now, cnt: {} };
        }

        downloads.forEach((d) => {
            let version_id = d.get('version.id');
            let key = moment(d.get('date')).utc().format('MMM D');
            if (dates[key]) {
                let prev = dates[key].cnt[version_id] || 0;
                dates[key].cnt[version_id] = prev + d.get('downloads');
            }
        });

        extra.forEach((d) => {
            let key = moment(d.date).utc().format('MMM D');
            if (dates[key]) {
                let prev = dates[key].cnt[null] || 0;
                dates[key].cnt[null] = prev + d.downloads;
            }
        });
        if (this.get('requestedVersion')) {
            versions.push(this.get('model').getProperties('id', 'num'));
        } else {
            this.get('smallSortedVersions').forEach(version => {
                versions.push(version.getProperties('id', 'num'));
            });
        }
        if (extra.length > 0) {
            versions.push({
                id: null,
                num: 'Other'
            });
        }

        let headers = ['Date'];
        versions.sort((b) => b.num).reverse();
        for (let i = 0; i < versions.length; i++) {
            headers.push(versions[i].num);
        }
        let data = [headers];
        for (let date in dates) {
            let row = [dates[date].date.toDate()];
            for (let i = 0; i < versions.length; i++) {
                row.push(dates[date].cnt[versions[i].id] || 0);
            }
            data.push(row);
        }

        return data;
    }),

    toggleClipboardProps(isSuccess) {
        this.setProperties({
            showSuccess: isSuccess,
            showNotification: true
        });
        later(this, () => {
            this.set('showNotification', false);
        }, 2000);
    },

    actions: {
        copySuccess(event) {
            event.clearSelection();
            this.toggleClipboardProps(true);
        },

        copyError() {
            this.toggleClipboardProps(false);
        },

        toggleFollow() {
            this.set('fetchingFollowing', true);

            let crate = this.get('crate');
            let op = this.toggleProperty('following') ?
                crate.follow() : crate.unfollow();

            return op.finally(() => this.set('fetchingFollowing', false));
        },
    },

    report: observer('crate.readme', function() {
        setTimeout(() => $(window).trigger('hashchange'));
    }),

});

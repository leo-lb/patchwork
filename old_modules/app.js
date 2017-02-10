var Modules = require('./modules')
var h = require('./lib/h')
var Value = require('mutant/value')
var when = require('mutant/when')
var computed = require('mutant/computed')
var toCollection = require('mutant/dict-to-collection')
var MutantDict = require('mutant/dict')
var MutantMap = require('mutant/map')
var watch = require('mutant/watch')

var plugs = require('patchbay/plugs')

module.exports = function (config, ssbClient) {
  var modules = Modules(config, ssbClient)

  var screenView = plugs.first(modules.plugs.screen_view)

  var searchTimer = null
  var searchBox = h('input.search', {
    type: 'search',
    placeholder: 'word, @key, #channel'
  })

  searchBox.oninput = function () {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(doSearch, 500)
  }

  searchBox.onfocus = function () {
    if (searchBox.value) {
      doSearch()
    }
  }

  var forwardHistory = []
  var backHistory = []

  var views = MutantDict({
    // preload tabs (and subscribe to update notifications)
    '/public': screenView('/public'),
    '/private': screenView('/private'),
    [ssbClient.id]: screenView(ssbClient.id),
    '/notifications': screenView('/notifications')
  })

  var lastViewed = {}

  // delete cached view after 30 mins of last seeing
  setInterval(() => {
    views.keys().forEach((view) => {
      if (lastViewed[view] !== true && Date.now() - lastViewed[view] > (30 * 60e3) && view !== currentView()) {
        views.delete(view)
      }
    })
  }, 60e3)

  var canGoForward = Value(false)
  var canGoBack = Value(false)
  var currentView = Value('/public')

  watch(currentView, (view) => {
    window.location.hash = `#${view}`
  })

  window.onhashchange = function (ev) {
    var path = window.location.hash.substring(1)
    if (path) {
      setView(path)
    }
  }

  var mainElement = h('div.main', MutantMap(toCollection(views), (item) => {
    return h('div.view', {
      hidden: computed([item.key, currentView], (a, b) => a !== b)
    }, [ item.value ])
  }))

  return h('MainWindow', {
    classList: [ '-' + process.platform ]
  }, [
    h('div.top', [
      h('span.history', [
        h('a', {
          'ev-click': goBack,
          classList: [ when(canGoBack, '-active') ]
        }, '<'),
        h('a', {
          'ev-click': goForward,
          classList: [ when(canGoForward, '-active') ]
        }, '>')
      ]),
      h('span.nav', [
        tab('Public', '/public'),
        tab('Private', '/private')
      ]),
      h('span.appTitle', ['Patchwork']),
      h('span', [ searchBox ]),
      h('span.nav', [
        tab('Profile', ssbClient.id),
        tab('Mentions', '/notifications')
      ])
    ]),
    mainElement
  ])

  // scoped

  function tab (name, view) {
    var instance = views.get(view)
    lastViewed[view] = true
    return h('a', {
      'ev-click': function (ev) {
        if (instance.pendingUpdates && instance.pendingUpdates() && instance.reload) {
          instance.reload()
        }
      },
      href: `#${view}`,
      classList: [
        when(selected(view), '-selected')
      ]
    }, [
      name,
      when(instance.pendingUpdates, [
        ' (', instance.pendingUpdates, ')'
      ])
    ])
  }

  function goBack () {
    if (backHistory.length) {
      canGoForward.set(true)
      forwardHistory.push(currentView())
      currentView.set(backHistory.pop())
      canGoBack.set(backHistory.length > 0)
    }
  }

  function goForward () {
    if (forwardHistory.length) {
      backHistory.push(currentView())
      currentView.set(forwardHistory.pop())
      canGoForward.set(forwardHistory.length > 0)
      canGoBack.set(true)
    }
  }

  function setView (view) {
    if (!views.has(view)) {
      views.put(view, screenView(view))
    }

    if (lastViewed[view] !== true) {
      lastViewed[view] = Date.now()
    }

    if (currentView() && lastViewed[currentView()] !== true) {
      lastViewed[currentView()] = Date.now()
    }

    if (view !== currentView()) {
      canGoForward.set(false)
      canGoBack.set(true)
      forwardHistory.length = 0
      backHistory.push(currentView())
      currentView.set(view)
    }
  }

  function doSearch () {
    var value = searchBox.value.trim()
    if (value.startsWith('/') || value.startsWith('?') || value.startsWith('@') || value.startsWith('#') || value.startsWith('%')) {
      setView(value)
    } else if (value.trim()) {
      setView(`?${value.trim()}`)
    } else {
      setView('/public')
    }
  }

  function selected (view) {
    return computed([currentView, view], (currentView, view) => {
      return currentView === view
    })
  }
}

function isSame (a, b) {
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false
      }
    }
    return true
  } else if (a === b) {
    return true
  }
}

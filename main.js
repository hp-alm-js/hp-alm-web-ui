var app = angular.module('AlmUi', ['$strap.directives']);

app.
  config(['$routeProvider', function($routeProvider) {
  $routeProvider.
      when('/', {
        redirectTo: function () {
          return "/home";
        }
      }).
      when('/home', {templateUrl: 'templates/hello.html', controller: HomeCtrl,}).
      when('/defects/:preset_name', {templateUrl: 'templates/defects.html',
                             controller: defects
                            }).
      when('/defect/:defect_id', {templateUrl: 'templates/defect.html',
                                  controller: defect
                                 })
}]);

app.directive('contenteditable', function() {
  return {
    restrict: 'A', // only activate on element attribute
    require: '?ngModel',
    link: function(scope, element, attrs, ngModel) {
      if(!ngModel) return; // do nothing if no ng-model

      // model -> view
      ngModel.$render = function() {
        element.html(ngModel.$viewValue);
      };
      // view -> model
      element.on('blur keyup change', function() {
        scope.$apply(read);
      });
      read(); // initialize

      // Write data to the model
      function read() {
        var html = element.html();
        // When we clear the content editable the browser leaves a <br> behind
        // If strip-br attribute is provided then we strip this out
        if( attrs.stripBr && html == '<br>' ) {
          html = '';
        }
        // some tags are discarded by the contenteditable
        // bring those back
        html = "<html><body>" + html + "</body></html>";
        ngModel.$setViewValue(html);
      }
    }
  };
});

function HomeCtrl($scope) {}


app.factory('UsersService', function($q, $rootScope) {
  return {
    getUsers: function getUsers(username, password) {
      var deferred = $q.defer();
      $rootScope.$broadcast('Loading');
      ALM.getUsers(function cb(users) {
        console.log('loaded users');
        $rootScope.$apply(function () {deferred.resolve(users)});
      }, function onError(error) {
        console.log('users loading error');
        $rootScope.$apply(function () {deferred.reject()});
        $rootScope.$broadcast('APIError', error);
      });
      return deferred.promise;
    },
  };
});

app.factory('LoginService', function($q, $rootScope) {
  var checkLogin = function () {
    var deferred = $q.defer();
    ALM.tryLogin(function onLogin(username) {
      $('#login_error').hide();
      $rootScope.$apply(function () {deferred.resolve(username)});
    }, function onError(error) {
      $rootScope.$apply(function () {deferred.reject("error")});
    });
    return deferred.promise;
  },
  login = function(username, password) {
    var deferred = $q.defer();
    ALM.login(username, password, function onLogin() {
      $rootScope.$apply(function () {deferred.resolve(true)});
    }, function onError() {
      $('#login_error').show();
      $rootScope.$apply(function () {deferred.resolve(false)});
    });
    return deferred.promise;
  },
  logout = function () {
    var deferred = $q.defer();
    ALM.logout(function() {
      $rootScope.$apply(function () {deferred.resolve()});
    });
    return deferred.promise;
  };
  return {
    checkLogin: checkLogin,
    login: login,
    logout: logout
  };
});

function appCtrl($scope, $route, LoginService, PresetsService, $location) {
  var onLoggedIn = function (currentUser) {
    console.log("Logged in");
    $scope.loading = false;
    $scope.presets = PresetsService.get(currentUser);
  },
      onLoggedOut = function (error) {
        console.log("Logged out");
        $scope.currentUser = null;
        $scope.presets = PresetsService.get($scope.currentUser);
        $scope.loading = false;
      };
  $scope.loading = true;
  ALM.config("http://qc2d.atlanta.hp.com/qcbin/", "BTO", "ETG");
  // login function
  $scope.login = function () {
    var username = $('#username').val(),
        password = $('#password').val();
    LoginService.login(username, password).then(function() {
      $scope.currentUser = LoginService.checkLogin();
      $scope.currentUser.then(function(user) {
        onLoggedIn(user);
        $('#login_form')[0].submit(); // submit to hidden frame
        // dirty hack to trigger other controllers to make additional AJAX request.
        $route.reload();
      }, onLoggedOut);
    });
  }
  // logout function
  $scope.logout = function () {
    LoginService.logout().then(function (){
      $scope.currentUser = null;
      $("#login_form").show();
      $('#login_container').css('display', 'block');
    });
  }
  var checkLogin = function () {
    $scope.currentUser = LoginService.checkLogin();
    $scope.currentUser.then(onLoggedIn, onLoggedOut);
  };
  // initial check login
  checkLogin();
  $scope.$on('APIError', function(event, error) {
    checkLogin();
  });
};

app.factory('DefectsService', function($q, $rootScope) {
  return {
    getAvailableValues: function getAvailableValues(fieldName) {
      var values = {
        "status": ["New", "Open", "Fixed", "Closed", "Deferred",
                     "Duplicate", "Closed - No Change"],
        "severity": ["1 - Urgent", "2 - High", "3 - Medium", "4 - Low"],
        "detected-in-rel": [
          {value: "440", label: "DDM Content Pack 14.00"},
          {value: "404", label: "DDM Content Pack 13.00"},
          {value: "403", label: "DDM Content Pack 12.00"},
          {value: "219", label: "DDM Content Pack 11.0"},
          {value: "218", label: "DDM Content Pack 10.0"},
          {value: "217", label: "DDM Content Pack 9.0"},
          {value: "165", label: "DDM Content Pack 8.0"},
          {value: "164", label: "DDM Content Pack 7.0"},
          {value: "240", label: "UCMDB 10.01"},
          {value: "241", label: "UCMDB 10.1"},
          {value: "429", label: "UDC 1.0"},
          {value: "437", label: "UDC 0.9"},
          {value: "121", label: "UCMDB Future Version"},
          {value: "230", label: "DDM Future Version"},
          {value: "", label: "Not set"}
        ],
        "user-43": ["Defect", "Enhancement"]
      };
      return values[fieldName];
    },
    getDefects: function getDefects(query) {
      var deferred = $q.defer(),
          queryString = "",
          fields = ["id","name",
                    //"description","dev-comments",
                    //"severity","attachment","detection-version",
                    //"detected-in-rel", "creation-time",
                    "owner", "status", "severity"
                   ];
      for (property in query.query) {
        if (query.query[property].length) {
          queryString += property + '["' +
                         query.query[property].join('" or "') + '"];';
        }
      }
      ALM.getDefects(function onSuccess(defects, totalCount) {
                       $rootScope.$apply(function() {
                         deferred.resolve({defects: defects, totalCount: totalCount});
                       });
                     }, function onError() {
                       $rootScope.$apply(function() {
                         $rootScope.$broadcast('APIError', 'error while loading defects');
                         deferred.reject('error');
                       });
                     },
                     queryString, fields);
      return deferred.promise;
    },
    getDefect: function getDefects(query) {
      var id = query.id
      var deferred = $q.defer(),
          queryString = 'id["' + id + '"]',
          fields = ["id","name","description","dev-comments",
                    "severity","attachment","detection-version",
                    "user-46",
                    "user-63",
                    "user-69",
                    "creation-time",
                    "owner",
                    "detected-by",
                    "status"];
      ALM.getDefects(function onSuccess(defects, totalCount) {
                       $rootScope.$apply(function() {
                         deferred.resolve(defects[0]);
                       });
                     }, function onError() {
                       deferred.reject();
                     },
                     queryString, fields);
      return deferred.promise;
    },
    getDefectAttachments: function getDefectAttachments(query) {
      var id = query.id
      var deferred = $q.defer();
      ALM.getDefectAttachments(id, function onSuccess(attachments) {
        $rootScope.$apply(function() {
          deferred.resolve(attachments);
        });
      }, function onError() {
        deferred.reject();
      });
      return deferred.promise;
    },
    saveDefect: function saveDefect(defect, lastSavedDefect) {
      var deferred = $q.defer();
      ALM.saveDefect(
        function onSave() {
          deferred.resolve();
          $rootScope.$apply();
        },
        function onError(error) {
          deferred.reject(error);
          $rootScope.$apply();
        },
        defect, lastSavedDefect
      );
      return deferred.promise;
    }
  };
});


var getPresetsFromStorage = function() {
  var presets = {};
  if (localStorage.queryPresets) {
    presets = JSON.parse(localStorage.queryPresets)
  }
  return presets;
}

var savePresetsToStorage = function(presets) {
  localStorage.queryPresets = JSON.stringify(presets);
}


app.factory('PresetsService', function($q, $rootScope) {
  return {
    get: function(currentUser) {
      var presets = {
        my: {
          id: "my",
          header: "My defects",
          query: {
            owner: [currentUser]
          }
        },
        team: {
          id: "team",
          header: "Team defects",
          query: {
            // TODO find a way to remove this hard-coded team name
            "user-95": ["DDM Content"],
            status: ['Open', 'New'],
            severity: ["2 - High", "1 - Urgent"]
          }
        }
      };
      $.extend(presets, getPresetsFromStorage());
      return presets;
    },
    save: function(newPresets) {
      savePresetsToStorage(newPresets);
    }
  };
});


var _getFullName = function(name, users) {
  for (var i = 0; i < users.length; ++i) {
    if(users[i].name == name) {
      return users[i].fullname;
    }
  }
};

function defects($scope, UsersService, PresetsService, DefectsService, $routeParams) {
  $scope.loading = true;
  $scope.$parent.currentUser.then(function(currentUser) {
    UsersService.getUsers().then(function onUsers(users) {
      $scope.loading = false;
      defectsWithUsers($scope, currentUser, users,
                       PresetsService, DefectsService, $routeParams);
    }, function onError() {});
  });
}

function defect($scope, UsersService, DefectsService, UsersService, $routeParams) {
  $scope.loading = true;
  UsersService.getUsers().then(function onUsers(users) {
    $scope.loading = false;
    defectWithUsers($scope, users, DefectsService, UsersService, $routeParams);
  }, function onError() {});
}

var defectsWithUsers = function defectsWithUsers($scope, currentUser, Users, PresetsService, DefectsService, $routeParams) {
  $scope.severities = DefectsService.getAvailableValues("severity");
  $scope.statuses = DefectsService.getAvailableValues("status");
  $scope.applies = DefectsService.getAvailableValues("detected-in-rel");
  $scope.issueTypes = DefectsService.getAvailableValues("user-43");
  $scope.presets = PresetsService.get(currentUser);
  $scope.preset = $scope.presets[$routeParams.preset_name];
  $scope.query = JSON.stringify($scope.preset.query);
  $scope.getFullName = function (name) {return _getFullName(name, Users);}
  $scope.refresh = function() {
    $scope.defects = null;
    $scope.loading = true;
    DefectsService.getDefects({query: $scope.preset.query}).then(function(defects) {
      $scope.loading = false;
      $scope.defects = defects.defects;
      $scope.totalCount = defects.totalCount;
    }, function onError(error) {
      $scope.loading = false;
    });
  }
  $scope.editPreset = function() {
    $scope.edit_preset = !$scope.edit_preset;
  }
  $scope.updatePreset = function() {
    PresetsService.save($scope.presets);
    $scope.edit_preset = false;
    $scope.refresh();
  }
  $scope.refresh();
}

function defectWithUsers($scope, Users, DefectsService, UsersService, $routeParams) {
  $scope.loading = true;
  DefectsService.getDefect({id: $routeParams.defect_id}).then(function(defect) {
    $scope.loading = false;
    $scope.defect = defect;
    $scope.last_saved_defect = angular.copy(defect);
    $scope.users = Users;
    $scope.statuses = DefectsService.getAvailableValues("status");
    $scope.filterUsers = function (user) {
        if(!$scope.filter) {return true;}
        //if (user.name == $scope.defect.owner) {return true;}
        if (user.fullname.toLowerCase().indexOf($scope.filter.toLowerCase()) != -1) {
          return true;
        }
    };
    $scope.getFullName = function(name) {
      var users = $scope.users;
      for (var i = 0; i < users.length; ++i) {
        if(users[i].name == name) {
          return users[i].fullname;
        }
      }
    };
    $scope.select = function(username) {
      $scope.defect.owner = username;
      $scope.filter = "";
      $scope.showBox = false;
    };
    $scope.showUsers = function(event) {
      $scope.showBox = !$scope.showBox;
    };
    $scope.saveEnabledClass = function() {
      var changed = ALM.getChanged($scope.last_saved_defect, $scope.defect);
      if (Object.keys(changed).length === 0) {
        return 'disabled';
      }
      return '';
    };
    $scope.save = function() {
      DefectsService.saveDefect($scope.defect, $scope.last_saved_defect).then(function onSave() {
        $scope.last_saved_defect = angular.copy($scope.defect);
      }, function onError(error) {
        $scope.errorMessage = error;
        console.log(error);
      });
    };
  });
  // TODO only if hasAttachments = Y
  DefectsService.getDefectAttachments({id: $routeParams.defect_id}).then(function(attachments) {
    $scope.attachments = attachments;
  })

}

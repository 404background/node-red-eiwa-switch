module.exports = function(RED) {
    "use strict";
    const {scheduleTask} = require("cronosjs");

    function EiwaSwitch(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
            msg.payload = msg.payload.toLowerCase();
            node.send(msg);
        });


        /* Handle legacy */
        if(!Array.isArray(n.props)){
            n.props = [];
            n.props.push({
                p:'payload',
                v:n.payload,
                vt:n.payloadType
            });
            n.props.push({
                p:'topic',
                v:n.topic,
                vt:'str'
            });
        } else {
            for (var i=0,l=n.props.length; i<l; i++) {
                if (n.props[i].p === 'payload' && !n.props[i].hasOwnProperty('v')) {
                    n.props[i].v = n.payload;
                    n.props[i].vt = n.payloadType;
                } else if (n.props[i].p === 'topic' && n.props[i].vt === 'str' && !n.props[i].hasOwnProperty('v')) {
                    n.props[i].v = n.topic;
                }
            }
        }

        this.props = n.props;
        this.repeat = n.repeat;
        this.crontab = n.crontab;
        this.once = n.once;
        this.onceDelay = (n.onceDelay || 0.1) * 1000;
        this.interval_id = null;
        this.cronjob = null;
        var node = this;

        node.props.forEach(function (prop) {
            if (prop.vt === "jsonata") {
                try {
                    var val = prop.v ? prop.v : "";
                    prop.exp = RED.util.prepareJSONataExpression(val, node);
                }
                catch (err) {
                    node.error(RED._("eiwa-switch.errors.invalid-expr", {error:err.message}));
                    prop.exp = null;
                }
            }
        });

        if (node.repeat > 2147483) {
            node.error(RED._("eiwa-switch.errors.toolong", this));
            delete node.repeat;
        }

        node.repeaterSetup = function () {
            if (this.repeat && !isNaN(this.repeat) && this.repeat > 0) {
                this.repeat = this.repeat * 1000;
                this.debug(RED._("eiwa-switch.repeat", this));
                this.interval_id = setInterval(function() {
                    node.emit("input", {});
                }, this.repeat);
            } else if (this.crontab) {
                this.debug(RED._("eiwa-switch.crontab", this));
                this.cronjob = scheduleTask(this.crontab,() => { node.emit("input", {})});
            }
        };

        if (this.once) {
            this.onceTimeout = setTimeout( function() {
                node.emit("input",{});
                node.repeaterSetup();
            }, this.onceDelay);
        } else {
            node.repeaterSetup();
        }

        this.on("input", function(msg, send, done) {
            const errors = [];
            let props = this.props;
            if (msg.__user_eiwa-switch_props__ && Array.isArray(msg.__user_eiwa-switch_props__)) {
                props = msg.__user_eiwa-switch_props__;
            }
            delete msg.__user_eiwa-switch_props__;
            props = [...props]
            function evaluateProperty(doneEvaluating) {
                if (props.length === 0) { 
                    doneEvaluating()
                    return
                }
                const p = props.shift()
                const property = p.p;
                const value = p.v !== undefined ? p.v : '';
                const valueType = p.vt !== undefined ? p.vt : 'str';
                if (property) {
                    if (valueType === "jsonata") {
                        if (p.v) {
                            try {
                                var exp = RED.util.prepareJSONataExpression(p.v, node);
                                RED.util.evaluateJSONataExpression(exp, msg, (err, newValue) => {
                                    if (err) {
                                        errors.push(err.toString())
                                    } else {
                                        RED.util.setMessageProperty(msg,property,newValue,true);
                                    }
                                    evaluateProperty(doneEvaluating)
                                });
                            } catch (err) {
                                errors.push(err.message);
                                evaluateProperty(doneEvaluating)
                            }
                        } else {
                            evaluateProperty(doneEvaluating)
                        }
                    } else {
                        try {
                            RED.util.evaluateNodeProperty(value, valueType, node, msg, (err, newValue) => {
                                if (err) {
                                    errors.push(err.toString())
                                } else {
                                    RED.util.setMessageProperty(msg,property,newValue,true);
                                }
                                evaluateProperty(doneEvaluating)
                            })
                        } catch (err) {
                            errors.push(err.toString());
                            evaluateProperty(doneEvaluating)
                        }
                    }
                } else {
                    evaluateProperty(doneEvaluating)
                }
            }
           
            evaluateProperty(() => {
                if (errors.length) {
                    done(errors.join('; '));
                } else {
                    send(msg);
                    done();
                }
            })
        });



    }

    RED.nodes.registerType("eiwa-switch",EiwaSwitch);

    EiwaSwitch.prototype.close = function() {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }
        if (this.interval_id != null) {
            clearInterval(this.interval_id);
        } else if (this.cronjob != null) {
            this.cronjob.stop();
            delete this.cronjob;
        }
    };

    RED.httpAdmin.post("/eiwa-switch/:id", RED.auth.needsPermission("eiwa-switch.write"), function(req,res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node != null) {
            try {
                if (req.body && req.body.__user_eiwa-switch_props__) {
                    node.receive(req.body);
                } else {
                    node.receive();
                }
                res.sendStatus(200);
            } catch(err) {
                res.sendStatus(500);
                node.error(RED._("eiwa-switch.failed",{error:err.toString()}));
            }
        } else {
            res.sendStatus(404);
        }
    });

}

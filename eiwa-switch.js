module.exports = function(RED) {
    function eiwa_switch(config) {
        var node = this;
        RED.nodes.createNode(this,config);
        this.MAC = config.MAC;
        let MAC_ADDRESS = node.MAC;
        node.on('input', function(msg) {
            msg.url=`https://swi-tch.jp/switch-on-off?MAC=${MAC_ADDRESS}&Token=token&SwSta=1`;

            node.send(msg);
        });
    }
    RED.nodes.registerType("eiwa-switch", eiwa_switch);
}

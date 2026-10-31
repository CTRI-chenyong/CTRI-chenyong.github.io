/* Iteration 1 rule set: L3SM (RFC 8299) -> L3NM (RFC 9182).
 *
 * Every section number, section title and node name below was checked
 * verbatim against the rfc-editor plain text on 2026-10-31, and is
 * re-checked by tools/check-rfc-citations.mjs. Nothing in this file is
 * fetched at runtime: the board has to keep working with the network
 * disconnected, so the rule table ships as a JS constant.
 *
 * Path shorthand: a source path is relative to /l3vpn-svc, a target path is
 * relative to /l3vpn-ntw/vpn-services/vpn-service unless it starts with
 * "vpn-services". Where the RFC puts a leaf inside a choice case, the exact
 * case is spelled out; where the spec table used a readable shorthand, the
 * `pathNote` field records what was elided.
 */
(function (global) {
  'use strict';

  var ns = global.Ietf3Tier || (global.Ietf3Tier = {});

  var RFC = {
    L3SM: { number: '8299', title: 'YANG Data Model for L3VPN Service Delivery', module: 'ietf-l3vpn-svc' },
    L3NM: { number: '9182', title: 'A YANG Network Data Model for Layer 3 VPNs', module: 'ietf-l3vpn-ntw' },
    COMMON: { number: '9181', title: 'YANG Data Model for Common VPN Types', module: 'ietf-vpn-common' }
  };

  /* Section titles are quoted verbatim from the numbered headings of the
     rfc-editor plain text. check-rfc-citations.mjs asserts both the number
     and the title. */
  var SECTIONS = {
    '8299': {
      '6.2': 'VPN Service Overview',
      '6.2.1': 'VPN Service Topology',
      '6.2.1.1': 'Route Target Allocation',
      '6.3': 'Site Overview',
      '6.3.1': 'Devices and Locations',
      '6.3.2': 'Site Network Accesses',
      '6.3.2.2': 'Connection',
      '6.4': 'Site Role',
      '6.5.2': 'Attaching a Site to a VPN',
      '6.6.7': 'Route Distinguisher and VRF Allocation',
      '6.11.7': 'BGP Routing'
    },
    '9182': {
      '7.3': 'VPN Services',
      '7.4': 'VPN Instance Profiles',
      '7.5': 'VPN Nodes',
      '7.6': 'VPN Network Accesses',
      '7.6.2': 'IP Connection',
      '7.6.3.2': 'BGP'
    }
  };

  var CATEGORIES = ['COPY', 'DERIVE', 'SPLIT', 'DROP'];
  var CONFIDENCE = ['standard', 'engineering-inference'];

  /* `mandatory` is the RFC-level fact (list key or an explicit mandatory
     statement). `requiredFor` is why this board asks for the value even when
     the RFC leaves it optional; null means the board does not require it.
     The two are rendered separately so the page never implies that RFC 8299
     requires a leaf it leaves optional. */
  var FIELDS = [
    {
      id: 'vpnId', scope: 'vpnService', group: 'VPN service', label: 'vpn-id',
      path: 'vpn-services/vpn-service/vpn-id', rfcSection: '6.2',
      yangType: 'string', typeNote: 'svc-id (string); list key of vpn-service',
      mandatory: true, requiredFor: null
    },
    {
      id: 'customerName', scope: 'vpnService', group: 'VPN service', label: 'customer-name',
      path: 'vpn-services/vpn-service/customer-name', rfcSection: '6.2',
      yangType: 'string', typeNote: 'string; optional in RFC 8299',
      mandatory: false,
      requiredFor: 'This board requires a customer name so that the COPY rule has a non-empty value to carry into RFC 9182.'
    },
    {
      id: 'vpnServiceTopology', scope: 'vpnService', group: 'VPN service', label: 'vpn-service-topology',
      path: 'vpn-services/vpn-service/vpn-service-topology', rfcSection: '6.2.1',
      yangType: 'identityref', typeNote: 'identityref, base vpn-topology',
      enumValues: ['any-to-any', 'hub-spoke', 'hub-spoke-disjoint'],
      defaultValue: 'any-to-any',
      mandatory: false, requiredFor: null
    },
    {
      id: 'siteId', scope: 'site', group: 'Site', label: 'site-id',
      path: 'sites/site/site-id', rfcSection: '6.3',
      yangType: 'string', typeNote: 'svc-id (string); list key of site',
      mandatory: true, requiredFor: null
    },
    {
      id: 'city', scope: 'site', group: 'Customer-private (DROP demo)', label: 'locations/location/city',
      path: 'sites/site/locations/location/city', rfcSection: '6.3.1',
      yangType: 'string', typeNote: 'string; customer-private detail',
      mandatory: false, requiredFor: null
    },
    {
      id: 'countryCode', scope: 'site', group: 'Customer-private (DROP demo)', label: 'locations/location/country-code',
      path: 'sites/site/locations/location/country-code', rfcSection: '6.3.1',
      yangType: 'string', typeNote: 'string, pattern [A-Z]{2}',
      pattern: '^[A-Z]{2}$',
      mandatory: false, requiredFor: null
    },
    {
      id: 'siteNetworkAccessId', scope: 'access', group: 'Site network access', label: 'site-network-access-id',
      path: 'sites/site/site-network-accesses/site-network-access/site-network-access-id',
      rfcSection: '6.3.2',
      yangType: 'string', typeNote: 'svc-id (string); list key of site-network-access',
      mandatory: true, requiredFor: null
    },
    {
      id: 'customerAddress', scope: 'access', group: 'Site network access', label: 'ip-connection/ipv4/addresses/customer-address',
      path: 'sites/site/site-network-accesses/site-network-access/ip-connection/ipv4/addresses/customer-address',
      rfcSection: '6.3.2.2',
      yangType: 'ipv4', typeNote: 'inet:ipv4-address; sits in the static "addresses" container',
      mandatory: false,
      requiredFor: 'Without a customer address the mapping produces an empty RFC 9182 address list, so the board asks for one.'
    },
    {
      id: 'prefixLength', scope: 'access', group: 'Site network access', label: 'ip-connection/ipv4/addresses/prefix-length',
      path: 'sites/site/site-network-accesses/site-network-access/ip-connection/ipv4/addresses/prefix-length',
      rfcSection: '6.3.2.2',
      yangType: 'uint8', typeNote: 'uint8, range 0..32',
      range: [0, 32],
      mandatory: false,
      requiredFor: 'RFC 9182 applies this prefix length to both the local and the customer address, so the board asks for it.'
    },
    {
      id: 'attachmentVpnId', scope: 'access', group: 'Site belonging to a VPN', label: 'vpn-attachment/vpn-id',
      path: 'sites/site/site-network-accesses/site-network-access/vpn-attachment/vpn-id',
      rfcSection: '6.5.2',
      yangType: 'leafref', typeNote: 'leafref to vpn-services/vpn-service/vpn-id; mandatory inside the (vpn-id) case',
      pathNote: 'The leaf lives in vpn-attachment/(attachment-flavor)/(vpn-id)/vpn-id.',
      mandatory: true, requiredFor: null
    },
    {
      id: 'siteRole', scope: 'access', group: 'Site role', label: 'vpn-attachment/site-role',
      path: 'sites/site/site-network-accesses/site-network-access/vpn-attachment/site-role',
      rfcSection: '6.4',
      yangType: 'identityref', typeNote: 'identityref, base site-role',
      enumValues: ['any-to-any-role', 'spoke-role', 'hub-role'],
      defaultValue: 'any-to-any-role',
      pathNote: 'The leaf lives in vpn-attachment/(attachment-flavor)/(vpn-id)/site-role.',
      mandatory: false, requiredFor: null
    },
    {
      id: 'bgpAutonomousSystem', scope: 'access', group: 'Routing protocol', label: 'routing-protocols/routing-protocol/bgp/autonomous-system',
      path: 'sites/site/site-network-accesses/site-network-access/routing-protocols/routing-protocol/bgp/autonomous-system',
      rfcSection: '6.11.7',
      yangType: 'uint32', typeNote: 'uint32; the customer-side AS number',
      range: [1, 4294967295],
      mandatory: true, requiredFor: null
    }
  ];

  function cite(rfcNumber, section, side) {
    return { rfc: rfcNumber, section: section, title: SECTIONS[rfcNumber][section], side: side };
  }

  var RULES = [
    {
      id: 'R01', category: 'COPY', confidence: 'standard',
      sourcePath: 'vpn-services/vpn-service/vpn-id', sourceField: 'vpnId',
      targetPath: 'vpn-services/vpn-service/vpn-id',
      citations: [cite('8299', '6.2', 'source'), cite('9182', '7.3', 'target')],
      note: 'Both models key the vpn-service list on vpn-id, so the identifier is carried over unchanged. RFC 9182 §7.3 states that a vpn-id is only meaningful locally to the network controller.'
    },
    {
      id: 'R02', category: 'COPY', confidence: 'standard',
      sourcePath: 'vpn-services/vpn-service/customer-name', sourceField: 'customerName',
      targetPath: 'vpn-services/vpn-service/customer-name',
      citations: [cite('8299', '6.2', 'source'), cite('9182', '7.3', 'target')],
      note: 'customer-name exists as an optional string leaf in both models and is carried over unchanged.'
    },
    {
      id: 'R03', category: 'COPY', confidence: 'standard',
      sourcePath: 'vpn-services/vpn-service/vpn-service-topology', sourceField: 'vpnServiceTopology',
      targetPath: 'vpn-services/vpn-service/vpn-service-topology',
      citations: [cite('8299', '6.2.1', 'source'), cite('9182', '7.3', 'target')],
      note: 'Same leaf name and same identity values on both sides: any-to-any, hub-spoke, hub-spoke-disjoint. RFC 9182 additionally allows "custom", which RFC 8299 does not define; a value that exists only on the L3NM side is therefore never produced by this rule.'
    },
    {
      id: 'R04', category: 'SPLIT', confidence: 'standard',
      sourcePath: 'sites/site/site-id', sourceField: 'siteId',
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-node-id',
      citations: [cite('8299', '6.3', 'source'), cite('9182', '7.5', 'target')],
      note: 'One L3SM site becomes one L3NM vpn-node per VPN service it is attached to, so a single site-id can fan out to several vpn-node-id values. RFC 9182 §7.5 states that the L3NM does not model the customer site itself, only the network-side node that receives its traffic.'
    },
    {
      id: 'R05', category: 'COPY', confidence: 'standard',
      sourcePath: 'sites/site/site-network-accesses/site-network-access/site-network-access-id',
      sourceField: 'siteNetworkAccessId',
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-network-accesses/vpn-network-access/id',
      citations: [cite('8299', '6.3.2', 'source'), cite('9182', '7.6', 'target')],
      note: 'The L3SM access identifier is reused as the key of the L3NM vpn-network-access list. The node names differ (site-network-access-id versus id) but both are the list key of the access entry.'
    },
    {
      id: 'R06', category: 'COPY', confidence: 'standard',
      sourcePath: 'sites/site/site-network-accesses/site-network-access/ip-connection/ipv4/addresses/provider-address',
      sourceField: null,
      outsideSubset: true,
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-network-accesses/vpn-network-access/ip-connection/ipv4/local-address',
      citations: [cite('8299', '6.3.2.2', 'source'), cite('9182', '7.6.2', 'target')],
      note: 'Provider-side address on both sides: RFC 8299 calls it provider-address, RFC 9182 calls it local-address and describes it as the address used at the provider interface. The source leaf is outside the declared iteration-1 input subset, so this rule is registered for completeness and only fires when a provider address is supplied.'
    },
    {
      id: 'R07', category: 'COPY', confidence: 'standard',
      sourcePath: 'sites/site/site-network-accesses/site-network-access/ip-connection/ipv4/addresses/customer-address',
      sourceField: 'customerAddress',
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-network-accesses/vpn-network-access/ip-connection/ipv4/static-addresses/address/customer-address',
      citations: [cite('8299', '6.3.2.2', 'source'), cite('9182', '7.6.2', 'target')],
      pathNote: 'In RFC 9182 the leaf sits in ip-connection/ipv4/(allocation-type)/(static-addresses)/address/customer-address; the choice and case names are elided in the target path above. The address list is keyed by address-id, which this POC allocates (see structuralKeys).',
      structuralKeys: ['address-id', 'primary-address'],
      note: 'Both leaves are typed inet:ipv4-address and both describe the customer side of the PE-CE link, so the value is carried over unchanged. RFC 9182 needs the static-addresses case to hold a customer address at all.'
    },
    {
      id: 'R08', category: 'COPY', confidence: 'standard',
      sourcePath: 'sites/site/site-network-accesses/site-network-access/ip-connection/ipv4/addresses/prefix-length',
      sourceField: 'prefixLength',
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-network-accesses/vpn-network-access/ip-connection/ipv4/prefix-length',
      citations: [cite('8299', '6.3.2.2', 'source'), cite('9182', '7.6.2', 'target')],
      note: 'Both leaves are uint8 with range 0..32. RFC 9182 describes its prefix-length as applying to both the local and the customer address, which matches the single prefix length that RFC 8299 puts next to provider-address and customer-address in the static addresses container.'
    },
    {
      id: 'R09', category: 'COPY', confidence: 'standard',
      sourcePath: 'sites/site/site-network-accesses/site-network-access/vpn-attachment/site-role',
      sourceField: 'siteRole',
      targetPath: 'vpn-services/vpn-service/vpn-instance-profiles/vpn-instance-profile/role',
      citations: [cite('8299', '6.4', 'source'), cite('9182', '7.4', 'target')],
      pathNote: 'In RFC 8299 the leaf sits in vpn-attachment/(attachment-flavor)/(vpn-id)/site-role. In RFC 9182 the vpn-instance-profile list is keyed by profile-id, which this POC allocates (see structuralKeys), and the access is bound to its profile through the vpn-network-access/vpn-instance-profile leafref.',
      structuralKeys: ['profile-id', 'vpn-instance-profile'],
      note: 'The role identities are shared through ietf-vpn-common, so any-to-any-role, spoke-role and hub-role keep their names. RFC 9182 §7.4 points at RFC 9181 for the role values and declares the same default, any-to-any-role.'
    },
    {
      id: 'R10', category: 'SPLIT', confidence: 'standard',
      sourcePath: 'sites/site/site-network-accesses/site-network-access/vpn-attachment/vpn-id',
      sourceField: 'attachmentVpnId',
      targetPath: 'vpn-services/vpn-service',
      citations: [cite('8299', '6.5.2', 'source'), cite('9182', '7.5', 'target')],
      pathNote: 'This rule has no single leaf target: the value selects which vpn-service entry the site-derived vpn-node is placed under. Its trace therefore points at the vpn-node that the placement produced, not at a leaf.',
      note: 'The L3SM vpn-attachment decides which VPN a site belongs to. In the L3NM that decision becomes the placement of a vpn-node inside a vpn-service, so one access attached to two VPNs produces nodes under two vpn-service entries.'
    },
    {
      id: 'R11', category: 'COPY', confidence: 'standard',
      sourcePath: 'sites/site/site-network-accesses/site-network-access/routing-protocols/routing-protocol/bgp/autonomous-system',
      sourceField: 'bgpAutonomousSystem',
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-network-accesses/vpn-network-access/routing-protocols/routing-protocol/bgp/peer-as',
      citations: [cite('8299', '6.11.7', 'source'), cite('9182', '7.6.3.2', 'target')],
      pathNote: 'The RFC 9182 routing-protocol list is keyed by id, and its type leaf selects the protocol; this POC allocates the id and sets type to bgp-routing, the routing-protocol-type identity defined in ietf-vpn-common (RFC 9181), because the bgp container only applies when type is derived from bgp-routing.',
      structuralKeys: ['id', 'type'],
      note: 'A rename plus a type change rather than a straight copy: RFC 8299 uses autonomous-system typed uint32 and mandatory, RFC 9182 uses peer-as typed inet:as-number and also mandatory. The customer AS becomes the peer AS seen from the provider edge. The numeric value is unchanged because inet:as-number is itself a uint32.'
    },
    {
      id: 'R12', category: 'DERIVE', confidence: 'engineering-inference',
      sourcePath: null, sourceField: null,
      targetPath: 'vpn-services/vpn-service/vpn-type',
      citations: [cite('9182', '7.3', 'target')],
      derivation: 'vpnType',
      note: 'RFC 8299 has no leaf that names the VPN type, so a value has to be chosen when building the L3NM instance. This POC always emits bgp-based-l3vpn, the identity defined in ietf-vpn-common (RFC 9181) that RFC 9182 §7.3 refers to through vpn-common:service-type. This is an engineering inference of the POC, not a mapping rule taken from either document.'
    },
    {
      id: 'R13', category: 'DERIVE', confidence: 'engineering-inference',
      sourcePath: null, sourceField: null,
      targetPath: 'vpn-services/vpn-service/vpn-instance-profiles/vpn-instance-profile/rd',
      citations: [cite('8299', '6.6.7', 'source'), cite('9182', '7.4', 'target')],
      pathNote: 'In RFC 9182 the leaf sits in vpn-instance-profile/(rd-choice)/(directly-assigned)/rd and is typed rt-types:route-distinguisher.',
      derivation: 'rd',
      note: 'RFC 8299 §6.6.7 leaves route distinguisher and VRF allocation to the management system and carries no RD leaf, so the L3SM side offers nothing to copy. This POC simulates that allocation: it takes the directly-assigned case and forms the RD as <provider AS>:<index from a per-service pool>, which stays stable for the same input. The allocation policy is an engineering inference of the POC.'
    },
    {
      id: 'R14', category: 'DERIVE', confidence: 'engineering-inference',
      sourcePath: null, sourceField: null,
      targetPath: 'vpn-services/vpn-service/vpn-instance-profiles/vpn-instance-profile/address-family/vpn-targets/vpn-target/route-targets/route-target',
      citations: [cite('8299', '6.2.1', 'source'), cite('8299', '6.2.1.1', 'source'), cite('9182', '7.4', 'target')],
      pathNote: 'route-targets is a list keyed by its own route-target leaf, so one emitted route target is one list entry. The enclosing vpn-target list is keyed by id, whose value and whose sibling route-target-type are allocated by this POC (see structuralKeys); route-target-type takes the ietf-routing-types enumeration values import and export. address-family is the key of the enclosing address-family list.',
      structuralKeys: ['address-family', 'id', 'route-target-type'],
      derivation: 'routeTarget',
      note: 'RFC 8299 §6.2.1 expresses the topology as an identity only, and §6.2.1.1 expects the management system to allocate the route targets while declaring the allocation mechanism out of scope; the model carries no route-target leaf. This POC therefore simulates that allocation: any-to-any gives every profile the same import and export target, while hub-spoke and hub-spoke-disjoint give each profile its own export target and point the hub profiles at the spoke targets. Values are formed as <provider AS>:<pool index>. The allocation policy is an engineering inference of the POC; hub-spoke-disjoint is treated like hub-spoke because disjoint hub sets are not modelled in iteration 1.'
    },
    {
      id: 'R15', category: 'DERIVE', confidence: 'engineering-inference',
      sourcePath: null, sourceField: null,
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-network-accesses/vpn-network-access/routing-protocols/routing-protocol/bgp/local-as',
      citations: [cite('9182', '7.6.3.2', 'target')],
      derivation: 'localAs',
      note: 'RFC 8299 only carries the customer AS, never the provider one, so there is no source leaf to copy. This POC emits the provider AS from the same simulated provider profile that allocates the RD. The value is an engineering inference of the POC.'
    },
    {
      id: 'R16', category: 'DERIVE', confidence: 'engineering-inference',
      sourcePath: null, sourceField: null,
      targetPath: 'vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-network-accesses/vpn-network-access/interface-id',
      citations: [cite('9182', '7.6', 'target')],
      derivation: 'interfaceId',
      note: 'interface-id is an optional string that names the network-side interface. The L3SM has no equivalent leaf, so this POC synthesises a stable identifier from the access id. The naming scheme is an engineering inference of the POC and carries no device meaning.'
    },
    {
      id: 'R17', category: 'DROP', confidence: 'standard',
      sourcePath: 'sites/site/locations/location/city|sites/site/locations/location/country-code',
      sourceField: 'city',
      sourceFields: ['city', 'countryCode'],
      targetPath: null,
      citations: [cite('8299', '6.3.1', 'source'), cite('9182', '7.5', 'target')],
      pathNote: 'The whole locations/location grouping is dropped; city and country-code are the two leaves this board exposes. The other leaves of that grouping (address, postal-code, state) are dropped for the same reason.',
      note: 'Customer site location is deliberately not carried into the network model. RFC 9182 §7.5 states that, unlike the L3SM, the L3NM does not need to model the customer site, only the points that receive traffic from it. This is a documented loss, not an omission: the dropped leaves are listed next to the metrics.'
    },
    {
      id: 'R18', category: 'DROP', confidence: 'standard',
      sourcePath: 'sites/site/requested-site-start|sites/site/requested-site-stop',
      sourceField: null,
      sourceFields: [],
      targetPath: null,
      citations: [cite('8299', '6.3', 'source'), cite('9182', '7.5', 'target')],
      note: 'Requested activation and deactivation dates are service-delivery scheduling data. RFC 9182 §7.5 keeps site information out of the network model, so these leaves have no target. Neither leaf is exposed on this board; the rule is registered so that the declared subset states the loss explicitly.'
    }
  ];

  /* Boundary of the declared subset. The denominator is a declaration count
     taken from the RFC 8299 module body between <CODE BEGINS> and
     <CODE ENDS>: 145 "leaf" plus 14 "leaf-list" statements, counted on
     2026-10-31. It is not a count of instantiated tree nodes, because
     groupings are reused; the page says so where it shows the ratio. */
  var SCOPE = {
    subsetFieldCount: 12,
    rfc8299LeafDeclarations: 145,
    rfc8299LeafListDeclarations: 14,
    rfc8299LeafTotal: 159,
    derivation: 'Counted "leaf" and "leaf-list" statements in the ietf-l3vpn-svc module body of rfc8299.txt on 2026-10-31.',
    statement: 'This board covers a declared subset of RFC 8299, not the full model. The device model tier and the L3NM to device mapping belong to a later iteration.'
  };

  /* Simulated provider profile. RFC 8299 §6.6.7 leaves RD, RT and the
     provider AS to the management system, so the POC has to invent a
     provider identity to derive anything at all. Every value produced from
     it is labelled as an engineering inference in the UI. */
  var PROVIDER = {
    asNumber: 64500,
    rdPoolBase: 100,
    rtPoolBase: 200,
    note: 'Simulated provider profile: AS 64500, RD pool starting at 64500:100, route target pool starting at 64500:200. RFC 8299 §6.6.7 leaves this allocation to the management system, so these numbers are an input to the POC rather than a value read from either model.'
  };

  /* Preset demo service: one VPN service, two site accesses, written the way
     RFC 8299 examples write it (documentation prefix 192.0.2.0/24). */
  var PRESET_INPUT = {
    vpnServices: [
      { vpnId: 'vpn-svc-1001', customerName: 'Example Bank Ltd', vpnServiceTopology: 'hub-spoke' }
    ],
    sites: [
      {
        siteId: 'site-hq', city: 'Geneva', countryCode: 'CH',
        accesses: [
          {
            siteNetworkAccessId: 'sna-hq-1', customerAddress: '192.0.2.10', prefixLength: 24,
            attachmentVpnId: 'vpn-svc-1001', siteRole: 'hub-role', bgpAutonomousSystem: 65011
          }
        ]
      },
      {
        siteId: 'site-branch', city: 'Zurich', countryCode: 'CH',
        accesses: [
          {
            siteNetworkAccessId: 'sna-branch-1', customerAddress: '192.0.2.20', prefixLength: 24,
            attachmentVpnId: 'vpn-svc-1001', siteRole: 'spoke-role', bgpAutonomousSystem: 65022
          }
        ]
      }
    ]
  };

  /* Structural differences between the tasking document wireframe and the
     RFC text, verified line by line on 2026-10-31. Rendered verbatim on the
     page so a reviewer can check the board against the RFCs rather than
     against the wireframe. */
  var DIFFERENCES = [
    {
      claim: 'RFC 8299 has no customers container and no customer-id, vpn-name or service-type leaf. The customer appears only as vpn-service/customer-name.',
      rfc: '8299', section: '6.2'
    },
    {
      claim: 'RFC 9182 has no sites list, no customer-id and no top-level route-distinguisher leaf. The RD lives inside vpn-instance-profile/(rd-choice).',
      rfc: '9182', section: '7.4'
    },
    {
      claim: 'The customer AS is named autonomous-system (uint32) in RFC 8299 and peer-as (inet:as-number) in RFC 9182, so the mapping is a rename plus a type change rather than a straight copy.',
      rfc: '9182', section: '7.6.3.2'
    },
    {
      claim: 'RFC 9182 §7.5 keeps customer site information out of the network model: it models the network-side node that receives site traffic, not the site. Location leaves therefore have no target and are recorded as a documented loss.',
      rfc: '9182', section: '7.5'
    },
    {
      claim: 'The topology identity values are any-to-any, hub-spoke and hub-spoke-disjoint. The spelling hub-and-spoke does not exist in either model.',
      rfc: '8299', section: '6.2.1'
    }
  ];

  var PLACEHOLDER_DRAFT = {
    name: 'draft-ietf-onsen-l3sm-l3nm-mapping',
    badge: 'PLACEHOLDER',
    disclaimer: 'Placeholder name — no such IETF document exists.'
  };

  ns.rules = {
    RFC: RFC,
    SECTIONS: SECTIONS,
    CATEGORIES: CATEGORIES,
    CONFIDENCE: CONFIDENCE,
    FIELDS: FIELDS,
    RULES: RULES,
    SCOPE: SCOPE,
    PROVIDER: PROVIDER,
    PRESET_INPUT: PRESET_INPUT,
    DIFFERENCES: DIFFERENCES,
    PLACEHOLDER_DRAFT: PLACEHOLDER_DRAFT
  };
})(typeof window !== 'undefined' ? window : globalThis);

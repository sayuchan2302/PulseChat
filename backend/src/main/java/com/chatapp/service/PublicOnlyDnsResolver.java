package com.chatapp.service;

import org.apache.hc.client5.http.DnsResolver;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;

/** Resolves a hostname once for the socket connection and rejects non-public results. */
final class PublicOnlyDnsResolver implements DnsResolver {
    private final AddressLookup addressLookup;

    PublicOnlyDnsResolver() {
        this(InetAddress::getAllByName);
    }

    PublicOnlyDnsResolver(AddressLookup addressLookup) {
        this.addressLookup = addressLookup;
    }

    @Override
    public InetAddress[] resolve(String host) throws UnknownHostException {
        InetAddress[] addresses = addressLookup.lookup(host);
        if (addresses == null || addresses.length == 0 || Arrays.stream(addresses).anyMatch(this::isBlockedAddress)) {
            throw new UnknownHostException("Host does not resolve exclusively to public addresses: " + host);
        }
        return addresses;
    }

    @Override
    public String resolveCanonicalHostname(String host) {
        // Avoid a second, unvalidated DNS lookup for an informational/pooling hostname.
        return host;
    }

    boolean isBlockedAddress(InetAddress address) {
        byte[] bytes = address.getAddress();
        if (bytes.length == 4) {
            return isBlockedIpv4(bytes);
        }

        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()
                || (bytes[0] & 0xfe) == 0xfc) {
            return true;
        }

        if (isIpv4MappedAddress(bytes)) {
            return isBlockedIpv4(Arrays.copyOfRange(bytes, 12, 16));
        }

        // Accept globally assigned IPv6 unicast only. Exclude special-use, documentation,
        // 6to4, and protocol translation ranges that can encode non-public IPv4 targets.
        return (bytes[0] & 0xe0) != 0x20
                || startsWith(bytes, 0x20, 0x01, 0x00)
                || startsWith(bytes, 0x20, 0x01, 0x0d, 0xb8)
                || startsWith(bytes, 0x20, 0x02)
                || startsWith(bytes, 0x00, 0x64, 0xff, 0x9b);
    }

    private boolean isBlockedIpv4(byte[] bytes) {
        int first = Byte.toUnsignedInt(bytes[0]);
        int second = Byte.toUnsignedInt(bytes[1]);
        int third = Byte.toUnsignedInt(bytes[2]);

        return first == 0
                || first == 10
                || (first == 100 && second >= 64 && second <= 127)
                || first == 127
                || (first == 169 && second == 254)
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && second == 0 && third == 0)
                || (first == 192 && second == 0 && third == 2)
                || (first == 192 && second == 88 && third == 99)
                || (first == 192 && second == 168)
                || (first == 198 && (second == 18 || second == 19))
                || (first == 198 && second == 51 && third == 100)
                || (first == 203 && second == 0 && third == 113)
                || first >= 224;
    }

    private boolean isIpv4MappedAddress(byte[] bytes) {
        if (bytes.length != 16 || bytes[10] != (byte) 0xff || bytes[11] != (byte) 0xff) {
            return false;
        }
        for (int index = 0; index < 10; index++) {
            if (bytes[index] != 0) return false;
        }
        return true;
    }

    private boolean startsWith(byte[] bytes, int... prefix) {
        if (bytes.length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (Byte.toUnsignedInt(bytes[index]) != prefix[index]) return false;
        }
        return true;
    }

    @FunctionalInterface
    interface AddressLookup {
        InetAddress[] lookup(String host) throws UnknownHostException;
    }
}

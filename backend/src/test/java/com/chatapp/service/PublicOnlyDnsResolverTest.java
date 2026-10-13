package com.chatapp.service;

import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PublicOnlyDnsResolverTest {
    @Test
    void returnsTheVettedAddressesForTheConnection() throws Exception {
        InetAddress publicAddress = InetAddress.getByAddress(new byte[]{8, 8, 8, 8});
        PublicOnlyDnsResolver resolver = new PublicOnlyDnsResolver(host -> new InetAddress[]{publicAddress});

        assertEquals(publicAddress, resolver.resolve("preview.example")[0]);
    }

    @Test
    void rejectsPrivateResultsAtConnectionResolutionTime() {
        InetAddress privateAddress = address(10, 0, 0, 5);
        AtomicInteger lookupCount = new AtomicInteger();
        PublicOnlyDnsResolver resolver = new PublicOnlyDnsResolver(host -> {
            lookupCount.incrementAndGet();
            return new InetAddress[]{privateAddress};
        });

        assertThrows(UnknownHostException.class, () -> resolver.resolve("rebind.example"));
        assertEquals(1, lookupCount.get());
    }

    @Test
    void rejectsCarrierGradeNatAndMappedPrivateIpv6Addresses() throws Exception {
        PublicOnlyDnsResolver resolver = new PublicOnlyDnsResolver();

        assertThrows(UnknownHostException.class, () -> resolver.resolve("100.64.0.1"));
        assertThrows(UnknownHostException.class, () -> resolver.resolve("::ffff:192.168.1.4"));
        assertThrows(UnknownHostException.class, () -> resolver.resolve("2001:0:4136:e378:8000:63bf:3fff:fdd2"));
    }

    private InetAddress address(int first, int second, int third, int fourth) {
        try {
            return InetAddress.getByAddress(new byte[]{(byte) first, (byte) second, (byte) third, (byte) fourth});
        } catch (UnknownHostException exception) {
            throw new AssertionError(exception);
        }
    }
}

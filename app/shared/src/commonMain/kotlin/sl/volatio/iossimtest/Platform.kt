package sl.volatio.iossimtest

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform